import { pool } from "../../db/pool.js";

export function createTeamRepository(database = pool) {
  return {
    async list() {
      const [rows] = await database.execute("SELECT id, email, status, last_login_at FROM users WHERE role = 'editor' ORDER BY created_at DESC");
      return rows;
    },
    async findByEmail(email) {
      const [rows] = await database.execute("SELECT id, email, role, status FROM users WHERE email = ? LIMIT 1", [email]);
      return rows[0] ?? null;
    },
    async invite(email, actorId) {
      const [result] = await database.execute("INSERT INTO users (email, role, status, invited_by) VALUES (?, 'editor', 'invited', ?)", [email, actorId]);
      return result.insertId;
    },
    async setStatus(id, status) {
      const [result] = await database.execute("UPDATE users SET status = ? WHERE id = ? AND role = 'editor'", [status, id]);
      return result.affectedRows > 0;
    },
    async remove(id, ownerId) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id, role FROM users WHERE id = ? FOR UPDATE", [id]);
        if (!rows.length || rows[0].role !== "editor") {throw new Error("Team member cannot be removed.");}
        const [ownerAuthors] = await connection.execute("SELECT id FROM authors WHERE user_id = ? LIMIT 1 FOR UPDATE", [ownerId]);
        let ownerAuthorId = ownerAuthors[0]?.id;
        if (!ownerAuthorId) {
          const [ownerRows] = await connection.execute("SELECT email, display_name FROM users WHERE id = ? LIMIT 1", [ownerId]);
          const owner = ownerRows[0];
          if (!owner) {throw new Error("Admin account is unavailable.");}
          const displayName = owner.display_name || owner.email.split("@")[0];
          const [created] = await connection.execute("INSERT INTO authors (user_id, display_name, slug, is_guest, show_on_about) VALUES (?, ?, ?, 0, 0)", [ownerId, displayName, `owner-${ownerId}`]);
          ownerAuthorId = created.insertId;
        }
        await connection.execute("UPDATE posts p JOIN authors a ON a.id = p.author_id SET p.author_id = ? WHERE a.user_id = ?", [ownerAuthorId, id]);
        await connection.execute("UPDATE posts SET created_by = ? WHERE created_by = ?", [ownerId, id]);
        await connection.execute("UPDATE authors SET user_id = NULL WHERE user_id = ?", [id]);
        await connection.execute("DELETE FROM users WHERE id = ? AND role = 'editor'", [id]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
    async writeAudit(entry) {
      await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip) VALUES (?, ?, ?, ?, ?, ?)", [entry.actorId, entry.action, "user", entry.entityId, entry.meta ? JSON.stringify(entry.meta) : null, entry.ip]);
    },
  };
}
