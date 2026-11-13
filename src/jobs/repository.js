import { pool } from "../db/pool.js";

export function createJobsRepository(database = pool) {
  return {
    async publishDue(limit = 100) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [posts] = await connection.execute("SELECT id, slug, scheduled_at FROM posts WHERE status = 'scheduled' AND scheduled_at <= UTC_TIMESTAMP() AND deleted_at IS NULL ORDER BY scheduled_at, id LIMIT ? FOR UPDATE SKIP LOCKED", [limit]);
        for (const post of posts) {
          await connection.execute("UPDATE posts SET status = 'published', published_at = COALESCE(published_at, UTC_TIMESTAMP()), updated_at = GREATEST(UTC_TIMESTAMP(), DATE_ADD(updated_at, INTERVAL 1 SECOND)) WHERE id = ? AND status = 'scheduled'", [post.id]);
          await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip) VALUES (NULL, 'post.publish', 'post', ?, ?, NULL)", [String(post.id), JSON.stringify({ scheduledAt: post.scheduled_at })]);
        }
        await connection.commit();
        return posts;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async bloggerAutoSyncEnabled() {
      const [rows] = await database.execute("SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1", ["blogger_auto_sync"]);
      const value = rows[0]?.setting_value;
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed?.value !== false;
    },
  };
}
