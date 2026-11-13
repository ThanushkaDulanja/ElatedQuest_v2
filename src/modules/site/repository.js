import { pool } from "../../db/pool.js";

export function createDemoRepository(database = pool) {
  return {
    async saveCategory(name, slug, order) {
      await database.execute("INSERT INTO categories (name, slug, description, sort_order, show_in_nav) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name), description = VALUES(description), sort_order = VALUES(sort_order), show_in_nav = 1", [name, slug, "Demo content category", order]);
      const [rows] = await database.execute("SELECT id FROM categories WHERE slug = ? LIMIT 1", [slug]);
      return rows[0].id;
    },
    async saveAuthor(name, slug, isGuest) {
      await database.execute("INSERT INTO authors (display_name, slug, bio, is_guest, show_on_about) VALUES (?, ?, ?, ?, 0) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), display_name = VALUES(display_name), bio = VALUES(bio), is_guest = VALUES(is_guest)", [name, slug, "An author for local demo stories.", isGuest ? 1 : 0]);
      const [rows] = await database.execute("SELECT id FROM authors WHERE slug = ? LIMIT 1", [slug]);
      return rows[0].id;
    },
    async saveTag(name, slug) {
      await database.execute("INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name)", [name, slug]);
      const [rows] = await database.execute("SELECT id FROM tags WHERE slug = ? LIMIT 1", [slug]);
      return rows[0].id;
    },
    async savePost(post) {
      await database.execute("INSERT INTO posts (title, slug, excerpt, content_html, content_text, category_id, author_id, created_by, status, published_at, reading_minutes, is_featured, is_editor_pick, view_count) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'published', ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), excerpt = VALUES(excerpt), content_html = VALUES(content_html), content_text = VALUES(content_text), category_id = VALUES(category_id), author_id = VALUES(author_id), status = 'published', published_at = VALUES(published_at), reading_minutes = VALUES(reading_minutes), is_featured = VALUES(is_featured), is_editor_pick = VALUES(is_editor_pick), view_count = VALUES(view_count), deleted_at = NULL", [post.title, post.slug, post.excerpt, post.contentHtml, post.contentText, post.categoryId, post.authorId, post.publishedAt, post.readingMinutes, post.featured ? 1 : 0, post.editorPick ? 1 : 0, post.viewCount]);
      const [rows] = await database.execute("SELECT id FROM posts WHERE slug = ? LIMIT 1", [post.slug]);
      await database.execute("DELETE FROM post_tags WHERE post_id = ?", [rows[0].id]);
      for (const tagId of post.tagIds) { await database.execute("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [rows[0].id, tagId]); }
      if (post.viewCount) { await database.execute("INSERT INTO post_daily_views (post_id, day, views) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE views = VALUES(views)", [rows[0].id, post.viewDay, post.viewCount]); }
    },
    async removeDemoPosts() {
      await database.execute("DELETE FROM posts WHERE slug LIKE ?", ["demo-%"]);
      await database.execute("DELETE FROM redirects WHERE from_slug LIKE ?", ["demo-%"]);
      await database.execute("DELETE FROM tags WHERE slug LIKE ? AND id NOT IN (SELECT tag_id FROM post_tags)", ["demo-tag-%"]);
      await database.execute("DELETE FROM authors WHERE slug IN (?, ?) AND id NOT IN (SELECT author_id FROM posts)", ["demo-writer", "demo-guest"]);
      await database.execute("DELETE FROM categories WHERE slug LIKE ? AND id NOT IN (SELECT category_id FROM posts WHERE category_id IS NOT NULL)", ["demo-category-%"]);
    },
  };
}
