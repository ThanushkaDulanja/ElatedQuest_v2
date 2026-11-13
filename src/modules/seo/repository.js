import { pool } from "../../db/pool.js";

export function createSeoRepository(database = pool) {
  return {
    async siteSettings() {
      const [rows] = await database.execute("SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1", ["general"]);
      const value = rows[0]?.setting_value;
      return value ? (typeof value === "string" ? JSON.parse(value) : value) : {};
    },
    async sitemapEntries() {
      const [posts] = await database.execute("SELECT slug, updated_at AS updatedAt FROM posts WHERE status = 'published' AND published_at <= UTC_TIMESTAMP() AND deleted_at IS NULL");
      const [categories] = await database.execute("SELECT c.slug, MAX(p.updated_at) AS updatedAt FROM categories c JOIN posts p ON p.category_id = c.id AND p.status = 'published' AND p.published_at <= UTC_TIMESTAMP() AND p.deleted_at IS NULL GROUP BY c.id, c.slug");
      const [tags] = await database.execute("SELECT t.slug, MAX(p.updated_at) AS updatedAt FROM tags t JOIN post_tags pt ON pt.tag_id = t.id JOIN posts p ON p.id = pt.post_id AND p.status = 'published' AND p.published_at <= UTC_TIMESTAMP() AND p.deleted_at IS NULL GROUP BY t.id, t.slug HAVING COUNT(DISTINCT p.id) >= 3");
      const [authors] = await database.execute("SELECT a.slug, MAX(p.updated_at) AS updatedAt FROM authors a JOIN posts p ON p.author_id = a.id AND p.status = 'published' AND p.published_at <= UTC_TIMESTAMP() AND p.deleted_at IS NULL GROUP BY a.id, a.slug");
      const [pages] = await database.execute("SELECT slug, updated_at AS updatedAt FROM pages");
      return [...posts.map((row) => ({ path: `/${row.slug}`, ...row })), ...categories.map((row) => ({ path: `/category/${row.slug}`, ...row })), ...tags.map((row) => ({ path: `/tag/${row.slug}`, ...row })), ...authors.map((row) => ({ path: `/author/${row.slug}`, ...row })), ...pages.map((row) => ({ path: `/${row.slug}`, ...row }))];
    },
    async feedPosts() {
      const [rows] = await database.execute("SELECT title, slug, excerpt, published_at FROM posts WHERE status = 'published' AND published_at <= UTC_TIMESTAMP() AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 20");
      return rows;
    },
  };
}
