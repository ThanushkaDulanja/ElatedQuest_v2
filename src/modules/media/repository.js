import { pool } from "../../db/pool.js";
import { MEDIA_UPLOAD_LIMITS } from "../../config/constants.js";

export function createMediaRepository(database = pool) {
  async function listUses(connection, media) {
    const relativeUrl = media.url_path;
    const [rows] = await connection.execute(
      "SELECT 'Cover' AS use_type, p.id AS source_id, p.title AS label FROM posts p WHERE p.cover_media_id = ? UNION ALL SELECT 'Open Graph image' AS use_type, p.id AS source_id, p.title AS label FROM posts p WHERE p.og_media_id = ? UNION ALL SELECT 'Author avatar' AS use_type, a.id AS source_id, a.display_name AS label FROM authors a WHERE a.avatar_media_id = ? UNION ALL SELECT 'Post body' AS use_type, p.id AS source_id, p.title AS label FROM posts p WHERE LOCATE(?, COALESCE(p.content_html, '')) > 0",
      [media.id, media.id, media.id, relativeUrl],
    );
    return rows;
  }
  return {
    async insert({ fileName, urlPath, width, height, sizeBytes, uploadedBy, ip }) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute("INSERT INTO media (file_name, url_path, mime, width, height, size_bytes, alt_text, credit_text, credit_url, uploaded_by) VALUES (?, ?, 'image/webp', ?, ?, ?, NULL, NULL, NULL, ?)", [fileName, urlPath, width, height, sizeBytes, uploadedBy]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'media.upload', 'media', ?, ?)", [uploadedBy, String(result.insertId), ip]);
        await connection.commit();
        return result.insertId;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async list({ query = "", offset = 0, limit = MEDIA_UPLOAD_LIMITS.listPageSize }) {
      const [rows] = await database.execute("SELECT m.id, m.file_name, m.url_path, m.mime, m.width, m.height, m.size_bytes, m.alt_text, m.credit_text, m.credit_url, m.created_at FROM media m WHERE (? = '' OR m.file_name LIKE CONCAT('%', ?, '%') OR COALESCE(m.alt_text, '') LIKE CONCAT('%', ?, '%') OR COALESCE(m.credit_text, '') LIKE CONCAT('%', ?, '%')) ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?", [query, query, query, query, limit, offset]);
      return Promise.all(rows.map(async (row) => ({ ...row, uses: await listUses(database, row) })));
    },
    async get(id) {
      const [rows] = await database.execute("SELECT id, file_name, url_path, mime, width, height, size_bytes, alt_text, credit_text, credit_url, created_at FROM media WHERE id = ? LIMIT 1", [id]);
      if (!rows[0]) {return null;}
      return { ...rows[0], uses: await listUses(database, rows[0]) };
    },
    async update(id, details, actorId, ip) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id FROM media WHERE id = ? FOR UPDATE", [id]);
        if (!rows.length) { await connection.rollback(); return false; }
        await connection.execute("UPDATE media SET alt_text = ?, credit_text = ?, credit_url = ? WHERE id = ?", [details.altText, details.creditText, details.creditUrl, id]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'media.update', 'media', ?, ?)", [actorId, String(id), ip]);
        await connection.commit();
        return true;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async deleteIfUnused(id, actorId, ip) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id, file_name, url_path FROM media WHERE id = ? FOR UPDATE", [id]);
        if (!rows[0]) { await connection.rollback(); return { deleted: false, missing: true, uses: [] }; }
        const uses = await listUses(connection, rows[0]);
        if (uses.length) { await connection.rollback(); return { deleted: false, uses }; }
        await connection.execute("DELETE FROM media WHERE id = ?", [id]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'media.delete', 'media', ?, ?)", [actorId, String(id), ip]);
        await connection.commit();
        return { deleted: true, media: rows[0], uses: [] };
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async incrementUploadLimit(userId, hits, windowMs) {
      const seconds = Math.ceil(windowMs / 1000);
      const key = `media-upload:${userId}`;
      await database.execute("INSERT INTO rate_limits (rl_key, hits, window_start) VALUES (?, 1, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE hits = IF(window_start <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND), 1, hits + 1), window_start = IF(window_start <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND), UTC_TIMESTAMP(), window_start)", [key, seconds, seconds]);
      const [rows] = await database.execute("SELECT hits FROM rate_limits WHERE rl_key = ?", [key]);
      return Number(rows[0]?.hits ?? 0) <= hits;
    },
  };
}
