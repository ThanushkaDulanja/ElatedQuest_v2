import { pool } from "../../db/pool.js";

export function createAuthRepository(database = pool) {
  return {
    async findUserById(id) {
      const [rows] = await database.execute(
        "SELECT id, email, display_name, role, status FROM users WHERE id = ? LIMIT 1",
        [id],
      );
      return rows[0] ?? null;
    },
    async findUserByEmail(email) {
      const [rows] = await database.execute(
        "SELECT id, email, display_name, role, status FROM users WHERE email = ? LIMIT 1",
        [email],
      );
      return rows[0] ?? null;
    },
    async provisionOwner(email, displayName) {
      await database.execute(
        "INSERT INTO users (email, display_name, role, status, last_login_at) VALUES (?, ?, 'owner', 'active', CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE display_name = COALESCE(VALUES(display_name), display_name), role = 'owner', status = 'active', last_login_at = CURRENT_TIMESTAMP",
        [email, displayName],
      );
      return this.findUserByEmail(email);
    },
    async activateLogin(email, displayName) {
      const [result] = await database.execute(
        "UPDATE users SET role = 'editor', status = 'active', display_name = COALESCE(?, display_name), last_login_at = CURRENT_TIMESTAMP WHERE email = ? AND status <> 'disabled'",
        [displayName, email],
      );
      if (!result.affectedRows) {
        return null;
      }
      return this.findUserByEmail(email);
    },
    async createLoginToken(kind, email, tokenHash, expiresAt) {
      await database.execute(
        "INSERT INTO login_tokens (kind, email, token_hash, expires_at) VALUES (?, ?, ?, ?)",
        [kind, email, tokenHash, expiresAt],
      );
    },
    async consumeLoginToken(kind, tokenHash) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT id, email FROM login_tokens WHERE kind = ? AND token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE",
          [kind, tokenHash],
        );
        if (!rows.length) {
          await connection.commit();
          return null;
        }
        const [updated] = await connection.execute(
          "UPDATE login_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL",
          [rows[0].id],
        );
        await connection.commit();
        return updated.affectedRows ? rows[0] : null;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async incrementRateLimit(key, limit, windowMs) {
      const seconds = Math.ceil(windowMs / 1000);
      const [result] = await database.execute(
        "INSERT INTO rate_limits (rl_key, hits, window_start) VALUES (?, 1, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE hits = IF(window_start <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND), 1, hits + 1), window_start = IF(window_start <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND), UTC_TIMESTAMP(), window_start)",
        [key, seconds, seconds],
      );
      const [rows] = await database.execute(
        "SELECT hits FROM rate_limits WHERE rl_key = ?",
        [key],
      );
      return {
        allowed: Number(rows[0]?.hits ?? 0) <= limit,
        hits: Number(rows[0]?.hits ?? 0),
        result,
      };
    },
    async writeAudit({
      actorId = null,
      action,
      entityType = null,
      entityId = null,
      meta = null,
      ip = null,
    }) {
      await database.execute(
        "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip) VALUES (?, ?, ?, ?, ?, ?)",
        [
          actorId,
          action,
          entityType,
          entityId,
          meta ? JSON.stringify(meta) : null,
          ip,
        ],
      );
    },
  };
}
