import { pool } from "../../db/pool.js";

export function createBloggerRepository(database = pool) {
  const postLocks = new Map();
  const lockName = (id) => `eq_blogger_${id}`;
  async function releasePostLock(id) {
    const connection = postLocks.get(String(id));
    if (!connection) { return null; }
    postLocks.delete(String(id));
    try { await connection.execute("SELECT RELEASE_LOCK(?)", [lockName(id)]); }
    finally { connection.release(); }
    return connection;
  }
  return {
    async connection() {
      const [rows] = await database.execute("SELECT provider, external_id AS blog_id, refresh_token_encrypted, needs_reconnect, connected_by, connected_at FROM integrations WHERE provider = ? LIMIT 1", ["blogger"]);
      return rows[0] ?? null;
    },
    async saveConnection(blogId, encryptedToken, userId) {
      await database.execute("INSERT INTO integrations (provider, external_id, refresh_token_encrypted, needs_reconnect, connected_by, connected_at) VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE external_id = VALUES(external_id), refresh_token_encrypted = VALUES(refresh_token_encrypted), needs_reconnect = 0, connected_by = VALUES(connected_by), connected_at = CURRENT_TIMESTAMP", ["blogger", String(blogId), encryptedToken, userId]);
    },
    async disconnect() {
      await database.execute("UPDATE integrations SET external_id = NULL, refresh_token_encrypted = NULL, needs_reconnect = 0, connected_by = NULL, connected_at = NULL WHERE provider = ?", ["blogger"]);
    },
    async needsReconnect() {
      await database.execute("UPDATE integrations SET needs_reconnect = 1 WHERE provider = ?", ["blogger"]);
    },
    async retryCandidates(limit = 100) {
      const [rows] = await database.execute("SELECT p.id FROM posts p WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.blogger_sync_status IN ('pending', 'failed') AND p.blogger_attempts < 5 AND EXISTS (SELECT 1 FROM integrations i WHERE i.provider = 'blogger' AND i.external_id IS NOT NULL AND i.refresh_token_encrypted IS NOT NULL AND i.needs_reconnect = 0) ORDER BY p.id LIMIT ?", [limit]);
      return rows.map((row) => row.id);
    },
    async failedPostCount() {
      const [rows] = await database.execute("SELECT COUNT(*) AS total FROM posts WHERE status = 'published' AND deleted_at IS NULL AND blogger_sync_status = 'failed'");
      return Number(rows[0]?.total ?? 0);
    },
    async failedPostIds(limit = 100) {
      const [rows] = await database.execute("SELECT p.id FROM posts p WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.blogger_sync_status IN ('pending', 'failed') AND EXISTS (SELECT 1 FROM integrations i WHERE i.provider = 'blogger' AND i.external_id IS NOT NULL AND i.refresh_token_encrypted IS NOT NULL AND i.needs_reconnect = 0) ORDER BY p.id LIMIT ?", [limit]);
      return rows.map((row) => row.id);
    },
    async postForSync(id) {
      const [rows] = await database.execute("SELECT p.id, p.title, p.slug, p.content_html, p.status, p.blogger_post_id, p.blogger_url, p.blogger_sync_status, c.name AS category_name FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1", [id]);
      if (!rows[0]) { return null; }
      const [tags] = await database.execute("SELECT t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name", [id]);
      return { ...rows[0], labels: [...new Set([rows[0].category_name, ...tags.map((tag) => tag.name)].filter(Boolean))] };
    },
    async claimPost(id) {
      const connection = await database.getConnection();
      let transaction = false;
      try {
        const [lockRows] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [lockName(id)]);
        if (Number(lockRows[0]?.acquired) !== 1) { connection.release(); return { pending: true }; }
        await connection.beginTransaction();
        transaction = true;
        const [rows] = await connection.execute("SELECT id, status, blogger_post_id FROM posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [id]);
        const current = rows[0];
        if (!current) { throw Object.assign(new Error("Post not found."), { status: 404 }); }
        if (current.status !== "published") { throw Object.assign(new Error("Only published posts can be synchronized."), { status: 409 }); }
        await connection.execute("UPDATE posts SET blogger_sync_status = 'pending', blogger_attempts = blogger_attempts + 1, blogger_last_error = NULL WHERE id = ?", [id]);
        await connection.commit();
        transaction = false;
        postLocks.set(String(id), connection);
        return { pending: false, bloggerPostId: current.blogger_post_id };
      } catch (error) {
        if (transaction) { await connection.rollback(); }
        try { await connection.execute("SELECT RELEASE_LOCK(?)", [lockName(id)]); } finally { connection.release(); }
        throw error;
      }
    },
    async completePost(id, externalPost) {
      const connection = postLocks.get(String(id)) ?? database;
      try { await connection.execute("UPDATE posts SET blogger_post_id = ?, blogger_url = ?, blogger_sync_status = 'synced', blogger_last_error = NULL, blogger_synced_at = CURRENT_TIMESTAMP WHERE id = ?", [String(externalPost.id), externalPost.url ?? null, id]); }
      finally { await releasePostLock(id); }
    },
    async failPost(id, message) {
      const connection = postLocks.get(String(id)) ?? database;
      try { await connection.execute("UPDATE posts SET blogger_sync_status = 'failed', blogger_last_error = ? WHERE id = ?", [String(message).slice(0, 500), id]); }
      finally { await releasePostLock(id); }
    },
    async audit(actorId, action, meta, ip) {
      await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, meta, ip) VALUES (?, ?, 'blogger', ?, ?)", [actorId, action, JSON.stringify(meta ?? {}), ip ?? null]);
    },
  };
}
