import { pool } from "../../db/pool.js";

export const isPublishedClause = "p.status = 'published' AND p.published_at <= UTC_TIMESTAMP() AND p.deleted_at IS NULL";

const CARD_COLUMNS = `p.id, p.title, p.slug, p.excerpt, p.content_text, p.category_id, p.published_at,
  p.reading_minutes, p.view_count, p.comment_count, p.rating_count, p.rating_sum, p.is_featured, p.is_editor_pick,
  c.name AS category_name, c.slug AS category_slug,
  a.id AS author_id, a.display_name AS author_name, a.slug AS author_slug, a.bio AS author_bio,
  am.url_path AS author_avatar_url, am.alt_text AS author_avatar_alt,
  m.url_path AS cover_url, m.alt_text AS cover_alt, m.width AS cover_width, m.height AS cover_height,
  m.credit_text AS cover_credit_text, m.credit_url AS cover_credit_url`;
const CARD_JOINS = `LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN authors a ON a.id = p.author_id
  LEFT JOIN media am ON am.id = a.avatar_media_id
  LEFT JOIN media m ON m.id = p.cover_media_id`;
const READER_CARD_COLUMNS = `p.id, p.title, p.slug, p.excerpt, p.content_text, p.published_at, p.comment_count,
  c.name AS category_name, c.slug AS category_slug, a.display_name AS author_name,
  m.url_path AS cover_url, m.alt_text AS cover_alt, m.width AS cover_width, m.height AS cover_height`;

export function createPublicSiteRepository(database = pool) {
  return {
    async readSiteSettings() {
      const [rows] = await database.execute("SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1", ["general"]);
      const value = rows[0]?.setting_value;
      if (!value) { return {}; }
      return typeof value === "string" ? JSON.parse(value) : value;
    },
    async readShareNetworks() {
      const [rows] = await database.execute("SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1", ["share_networks"]);
      const value = rows[0]?.setting_value;
      return value ? (typeof value === "string" ? JSON.parse(value) : value) : ["facebook", "x", "whatsapp", "email", "copy"];
    },
    async readMenus(location) {
      const [rows] = await database.execute("SELECT label, url, sort_order, open_in_new_tab FROM menu_items WHERE location = ? AND is_active = 1 ORDER BY sort_order, id", [location]);
      return rows;
    },
    async readSocialLinks() {
      const [rows] = await database.execute("SELECT platform, label, url, followers_label, show_in_top_bar, show_in_footer, show_in_stay_connected, sort_order FROM social_links WHERE is_active = 1 ORDER BY sort_order, id");
      return rows;
    },
    async readNavigationCategories() {
      const [rows] = await database.execute("SELECT id, name, slug, sort_order FROM categories WHERE show_in_nav = 1 ORDER BY sort_order, name, id");
      return rows;
    },
    async readHomeCategories() {
      const [rows] = await database.execute(`SELECT c.id, c.name, c.slug, COUNT(p.id) AS post_count FROM categories c JOIN posts p ON p.category_id = c.id AND ${isPublishedClause} GROUP BY c.id ORDER BY post_count DESC, c.name, c.id LIMIT 100`);
      return rows;
    },
    async pageBySlug(slug) {
      const [rows] = await database.execute("SELECT id, slug, title, content_html, updated_at FROM pages WHERE slug = ? LIMIT 1", [slug]);
      return rows[0] ?? null;
    },
    async postBySlug(slug) {
      const [rows] = await database.execute(`SELECT p.id, p.title, p.slug, p.excerpt, p.content_html, p.content_text, p.published_at FROM posts p WHERE ${isPublishedClause} AND p.slug = ? LIMIT 1`, [slug]);
      return rows[0] ?? null;
    },
    async redirectBySlug(slug) {
      const [rows] = await database.execute("SELECT to_slug FROM redirects WHERE from_slug = ? LIMIT 1", [slug]);
      return rows[0]?.to_slug ?? null;
    },
    async newestPublished(limit = 6) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} ORDER BY p.published_at DESC, p.id DESC LIMIT ?`, [limit]);
      return rows;
    },
    async alsoReadingCandidates(categorySlug = null, limit = 12) {
      const [rows] = await database.execute(`SELECT ${READER_CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND (? IS NULL OR p.category_id = (SELECT id FROM categories WHERE slug = ? LIMIT 1)) ORDER BY p.published_at DESC, p.id DESC LIMIT ?`, [categorySlug, categorySlug, limit]);
      return rows;
    },
    async postsByIds(ids) {
      if (!ids.length) { return []; }
      const placeholders = ids.map(() => "?").join(", ");
      const [rows] = await database.execute(`SELECT ${READER_CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.id IN (${placeholders})`, ids);
      const byId = new Map(rows.map((post) => [String(post.id), post]));
      return ids.map((id) => byId.get(String(id))).filter(Boolean);
    },
    async randomPublished() {
      const [rows] = await database.execute(`SELECT p.slug FROM posts p WHERE ${isPublishedClause} ORDER BY RAND() LIMIT 1`);
      return rows[0]?.slug ?? null;
    },
    async homeFeatured() {
      const [mainRows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} ORDER BY CASE WHEN p.is_featured = 1 THEN 0 ELSE 1 END, p.published_at DESC, p.id DESC LIMIT 1`);
      const featured = mainRows[0] ?? null;
      if (!featured) { return { featured: null, companions: [] }; }
      const [companions] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.id <> ? ORDER BY p.is_featured DESC, p.is_editor_pick DESC, p.published_at DESC, p.id DESC LIMIT 2`, [featured.id]);
      return { featured, companions };
    },
    async homeLatest({ featuredIds = [], offset = 0, limit = 10 } = {}) {
      const ids = [...featuredIds, 0, 0, 0].slice(0, 3);
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.id <> ? AND p.id <> ? AND p.id <> ? ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`, [...ids, limit, offset]);
      return rows;
    },
    async countPublishedAll() {
      const [rows] = await database.execute(`SELECT COUNT(*) AS total FROM posts p WHERE ${isPublishedClause}`);
      return Number(rows[0]?.total ?? 0);
    },
    async postDetailBySlug(slug) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS}, p.content_html, p.seo_title, p.seo_description, p.updated_at FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.slug = ? LIMIT 1`, [slug]);
      return rows[0] ?? null;
    },
    async previewPostById(postId) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS}, p.content_html, p.seo_title, p.seo_description FROM posts p ${CARD_JOINS} WHERE p.deleted_at IS NULL AND p.id = ? LIMIT 1`, [postId]);
      return rows[0] ?? null;
    },
    async postTags(postId) {
      const [rows] = await database.execute("SELECT t.id, t.name, t.slug FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ? ORDER BY t.name, t.id", [postId]);
      return rows;
    },
    async relatedCandidates(postId, limit = 60) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS}, (SELECT COUNT(*) FROM post_tags mine JOIN post_tags other ON other.tag_id = mine.tag_id WHERE mine.post_id = ? AND other.post_id = p.id) AS shared_tag_count FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.id <> ? AND (p.category_id = (SELECT category_id FROM posts WHERE id = ?) OR EXISTS (SELECT 1 FROM post_tags mine JOIN post_tags other ON other.tag_id = mine.tag_id WHERE mine.post_id = ? AND other.post_id = p.id)) ORDER BY p.published_at DESC, p.id DESC LIMIT ?`, [postId, postId, postId, postId, limit]);
      return rows;
    },
    async categoryBySlug(slug) {
      const [rows] = await database.execute("SELECT id, name, slug, description FROM categories WHERE slug = ? LIMIT 1", [slug]);
      return rows[0] ?? null;
    },
    async tagBySlug(slug) {
      const [rows] = await database.execute("SELECT id, name, slug FROM tags WHERE slug = ? LIMIT 1", [slug]);
      return rows[0] ?? null;
    },
    async authorBySlug(slug) {
      const [rows] = await database.execute("SELECT a.id, a.display_name AS name, a.slug, a.bio, a.avatar_media_id, m.url_path AS avatar_url, m.alt_text AS avatar_alt FROM authors a LEFT JOIN media m ON m.id = a.avatar_media_id WHERE a.slug = ? LIMIT 1", [slug]);
      return rows[0] ?? null;
    },
    async countCategory(categoryId) {
      const [rows] = await database.execute(`SELECT COUNT(*) AS total FROM posts p WHERE ${isPublishedClause} AND p.category_id = ?`, [categoryId]);
      return Number(rows[0]?.total ?? 0);
    },
    async countTag(tagId) {
      const [rows] = await database.execute(`SELECT COUNT(*) AS total FROM posts p JOIN post_tags pt ON pt.post_id = p.id WHERE ${isPublishedClause} AND pt.tag_id = ?`, [tagId]);
      return Number(rows[0]?.total ?? 0);
    },
    async countAuthor(authorId) {
      const [rows] = await database.execute(`SELECT COUNT(*) AS total FROM posts p WHERE ${isPublishedClause} AND p.author_id = ?`, [authorId]);
      return Number(rows[0]?.total ?? 0);
    },
    async categoryPosts(categoryId, offset, limit) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.category_id = ? ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`, [categoryId, limit, offset]);
      return rows;
    },
    async publishedCategoryPosts(categoryId, offset, limit) {
      const [rows] = await database.execute(`SELECT ${READER_CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.category_id = ? ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`, [categoryId, limit, offset]);
      return rows;
    },
    async tagPosts(tagId, offset, limit) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} JOIN post_tags pt ON pt.post_id = p.id WHERE ${isPublishedClause} AND pt.tag_id = ? ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`, [tagId, limit, offset]);
      return rows;
    },
    async authorPosts(authorId, offset, limit) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.author_id = ? ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`, [authorId, limit, offset]);
      return rows;
    },
    async sidebarEditorPicks(limit = 3) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.is_editor_pick = 1 ORDER BY p.published_at DESC, p.id DESC LIMIT ?`, [limit]);
      return rows;
    },
    async sidebarPopularPosts(limit = 5, days = 7) {
      const lookback = Math.max(0, Math.min(29, Number(days) - 1));
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS}, COALESCE(popular.recent_views, 0) AS recent_views FROM posts p ${CARD_JOINS} LEFT JOIN (SELECT post_id, SUM(views) AS recent_views FROM post_daily_views WHERE day >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY post_id) popular ON popular.post_id = p.id WHERE ${isPublishedClause} ORDER BY recent_views DESC, p.published_at DESC, p.id DESC LIMIT ?`, [lookback, limit]);
      return rows;
    },
    async sidebarPopularCategories(limit = 8) {
      const [rows] = await database.execute(`SELECT c.id, c.name, c.slug, COUNT(p.id) AS post_count FROM categories c JOIN posts p ON p.category_id = c.id AND ${isPublishedClause} GROUP BY c.id ORDER BY post_count DESC, c.name, c.id LIMIT ?`, [limit]);
      return rows;
    },
    async searchPosts(query, offset, limit) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS}, MATCH(p.title, p.excerpt, p.content_text) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND MATCH(p.title, p.excerpt, p.content_text) AGAINST(? IN NATURAL LANGUAGE MODE) ORDER BY relevance DESC, p.published_at DESC LIMIT ? OFFSET ?`, [query, query, limit, offset]);
      return rows;
    },
    async searchTitleFallback(query, offset, limit) {
      const [rows] = await database.execute(`SELECT ${CARD_COLUMNS} FROM posts p ${CARD_JOINS} WHERE ${isPublishedClause} AND p.title LIKE ? ESCAPE '\\\\' ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`, [query, limit, offset]);
      return rows;
    },
    async countSearch(query, titleFallback = false) {
      const condition = titleFallback ? "p.title LIKE ? ESCAPE '\\\\'" : "MATCH(p.title, p.excerpt, p.content_text) AGAINST(? IN NATURAL LANGUAGE MODE)";
      const [rows] = await database.execute(`SELECT COUNT(*) AS total FROM posts p WHERE ${isPublishedClause} AND ${condition}`, [query]);
      return Number(rows[0]?.total ?? 0);
    },
    async popularSearchEmptyState(limit = 4) { return this.sidebarPopularPosts(limit); },
    async incrementPublishedView(postId) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [visible] = await connection.execute(`SELECT p.id FROM posts p WHERE ${isPublishedClause} AND p.id = ? FOR UPDATE`, [postId]);
        if (!visible.length) { await connection.rollback(); return false; }
        await connection.execute("INSERT INTO post_daily_views (post_id, day, views) VALUES (?, UTC_DATE(), 1) ON DUPLICATE KEY UPDATE views = views + 1", [postId]);
        await connection.execute(`UPDATE posts p SET view_count = view_count + 1 WHERE ${isPublishedClause} AND p.id = ?`, [postId]);
        await connection.commit();
        return true;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
