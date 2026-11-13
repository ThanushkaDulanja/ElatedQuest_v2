import { pool } from "../../db/pool.js";

export function createAuthorsRepository(database = pool) {
  return {
    async findForUser(userId) { const [rows] = await database.execute("SELECT id, user_id, display_name, slug, bio, avatar_media_id, is_guest, show_on_about FROM authors WHERE user_id = ? LIMIT 1", [userId]); return rows[0] ?? null; },
    async findById(id) { const [rows] = await database.execute("SELECT id, user_id, display_name, slug, bio, avatar_media_id, is_guest, show_on_about FROM authors WHERE id = ? LIMIT 1", [id]); return rows[0] ?? null; },
    async updateUserDisplayName(userId, displayName) { await database.execute("UPDATE users SET display_name = ? WHERE id = ?", [displayName, userId]); },
    async findSlug(slug) { const [rows] = await database.execute("SELECT id FROM authors WHERE slug = ? LIMIT 1", [slug]); return rows[0] ?? null; },
    async save(author, values) {
      if (author) {await database.execute("UPDATE authors SET display_name = ?, slug = ?, bio = ?, avatar_media_id = ?, show_on_about = ? WHERE id = ?", [values.displayName, values.slug, values.bio, values.avatarMediaId, values.showOnAbout, author.id]);}
      else { const [result] = await database.execute("INSERT INTO authors (user_id, display_name, slug, bio, avatar_media_id, show_on_about, is_guest) VALUES (?, ?, ?, ?, ?, ?, 0)", [values.userId, values.displayName, values.slug, values.bio, values.avatarMediaId, values.showOnAbout]); return result.insertId; }
      return author.id;
    },
    async saveGuest(values, id = null) {
      if (id) { await database.execute("UPDATE authors SET display_name = ?, slug = ?, bio = ?, avatar_media_id = ?, show_on_about = ?, is_guest = 1 WHERE id = ? AND is_guest = 1", [values.displayName, values.slug, values.bio, values.avatarMediaId, values.showOnAbout, id]); return id; }
      const [result] = await database.execute("INSERT INTO authors (display_name, slug, bio, avatar_media_id, show_on_about, is_guest) VALUES (?, ?, ?, ?, ?, 1)", [values.displayName, values.slug, values.bio, values.avatarMediaId, values.showOnAbout]); return result.insertId;
    },
    async list() { const [rows] = await database.execute("SELECT id, display_name, slug, bio, avatar_media_id, show_on_about, is_guest, user_id FROM authors ORDER BY display_name"); return rows; },
    async listAbout() { const [rows] = await database.execute("SELECT a.id, a.display_name, a.slug, a.bio, m.url_path AS avatar_url, m.alt_text AS avatar_alt FROM authors a LEFT JOIN media m ON m.id = a.avatar_media_id WHERE a.show_on_about = 1 ORDER BY a.display_name, a.id"); return rows; },
    async writeAudit(entry) { await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip) VALUES (?, ?, 'author', ?, ?, ?)", [entry.actorId, entry.action, entry.entityId, JSON.stringify(entry.meta), entry.ip]); },
  };
}
