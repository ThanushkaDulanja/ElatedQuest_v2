import { pool } from "../../db/pool.js";

export function createPagesRepository(database = pool) {
  return {
    async list() {
      const [rows] = await database.execute("SELECT id, slug, title, updated_at FROM pages WHERE slug IN (?, ?, ?, ?, ?, ?, ?, ?) ORDER BY FIELD(slug, 'about-us', 'contact-us', 'story-terms', 'privacy-policy', 'image-use-policy', 'dmca-removal', 'join-us', 'terms')", ["about-us", "contact-us", "story-terms", "privacy-policy", "image-use-policy", "dmca-removal", "join-us", "terms"]);
      return rows;
    },
    async find(slug) {
      const [rows] = await database.execute("SELECT id, slug, title, content_html, updated_at FROM pages WHERE slug = ? LIMIT 1", [slug]);
      return rows[0] ?? null;
    },
    async save(slug, title, contentHtml, actorId, ip) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute("UPDATE pages SET title = ?, content_html = ?, updated_by = ? WHERE slug = ?", [title, contentHtml, actorId, slug]);
        if (!result.affectedRows) { throw Object.assign(new Error("Page not found."), { status: 404 }); }
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip) VALUES (?, 'page.update', 'page', (SELECT id FROM pages WHERE slug = ?), ?, ?)", [actorId, slug, JSON.stringify({ slug, title }), ip ?? null]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
