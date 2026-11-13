import { pool } from "../../db/pool.js";

export function createPostsRepository(database = pool) {
  return {
    async getPost(id) {
      const [rows] = await database.execute("SELECT p.*, u.display_name AS creator_name, a.display_name AS author_name, cm.url_path AS cover_url, cm.alt_text AS cover_alt, cm.credit_text AS cover_credit, cm.credit_url AS cover_credit_link, om.url_path AS og_url FROM posts p LEFT JOIN users u ON u.id = p.created_by LEFT JOIN authors a ON a.id = p.author_id LEFT JOIN media cm ON cm.id = p.cover_media_id LEFT JOIN media om ON om.id = p.og_media_id WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1", [id]);
      if (!rows[0]) {return null;}
      const [tags] = await database.execute("SELECT t.id, t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name", [id]);
      return { ...rows[0], tags };
    },
    async ensureAuthor(user) {
      const [rows] = await database.execute("SELECT id FROM authors WHERE user_id = ? LIMIT 1", [user.id]);
      if (rows[0]) {return rows[0].id;}
      const [result] = await database.execute("INSERT INTO authors (user_id, display_name, slug, is_guest, show_on_about) VALUES (?, ?, ?, 0, 0)", [user.id, user.display_name || user.email.split("@")[0], `user-${user.id}`]);
      return result.insertId;
    },
    async createDraft(user, authorId) {
      const [result] = await database.execute("INSERT INTO posts (title, slug, author_id, created_by, status) VALUES ('Untitled draft', CONCAT('draft-', UUID_SHORT()), ?, ?, 'draft')", [authorId, user.id]);
      return result.insertId;
    },
    async savePost(id, fields, expectedUpdatedAt, actorId, tags, changedSlug, ip, snapshot = true) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [currentRows] = await connection.execute("SELECT id, slug, status, published_at FROM posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!currentRows[0]) {throw new Error("Post not found.");}
        const [matchRows] = await connection.execute("SELECT id FROM posts WHERE id = ? AND updated_at = ? AND deleted_at IS NULL", [id, expectedUpdatedAt]);
        if (!matchRows.length) {
          await connection.rollback();
          return { conflict: true };
        }
        if (changedSlug && currentRows[0].published_at) {
          await connection.execute("UPDATE redirects SET to_slug = ? WHERE to_slug = ?", [fields.slug, currentRows[0].slug]);
          await connection.execute("INSERT INTO redirects (from_slug, to_slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE to_slug = VALUES(to_slug)", [currentRows[0].slug, fields.slug]);
        }
        await connection.execute("UPDATE posts SET title = ?, slug = ?, excerpt = ?, content_html = ?, content_text = ?, reading_minutes = ?, category_id = ?, seo_title = ?, seo_description = ?, canonical_url = ?, cover_media_id = ?, og_media_id = ?, allow_comments = ?, author_id = ?, is_featured = ?, is_editor_pick = ?, updated_at = GREATEST(UTC_TIMESTAMP(), DATE_ADD(updated_at, INTERVAL 1 SECOND)) WHERE id = ?", [fields.title, fields.slug, fields.excerpt, fields.content_html, fields.content_text, fields.reading_minutes, fields.category_id, fields.seo_title, fields.seo_description, fields.canonical_url, fields.cover_media_id, fields.og_media_id, fields.allow_comments, fields.author_id, fields.is_featured, fields.is_editor_pick, id]);
        await connection.execute("DELETE FROM post_tags WHERE post_id = ?", [id]);
        for (const tag of tags) {
          await connection.execute("INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)", [tag.name, tag.slug]);
          const [tagRows] = await connection.execute("SELECT id FROM tags WHERE slug = ? LIMIT 1", [tag.slug]);
          const tagId = tagRows[0].id;
          await connection.execute("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [id, tagId]);
        }
        if (snapshot) {
          if (snapshot === "throttled") {
            const [last] = await connection.execute("SELECT created_at FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", [id]);
            const lastTime = last[0] ? (last[0].created_at instanceof Date ? last[0].created_at.getTime() : new Date(`${last[0].created_at}Z`).getTime()) : 0;
            snapshot = !last[0] || Date.now() - lastTime >= 300000;
          }
          if (snapshot) { await connection.execute("INSERT INTO post_revisions (post_id, title, content_html, edited_by) VALUES (?, ?, ?, ?)", [id, fields.title, fields.content_html, actorId]); }
        }
        await connection.execute("DELETE FROM post_revisions WHERE post_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 50) kept)", [id, id]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'post.update', 'post', ?, ?)", [actorId, String(id), ip ?? null]);
        await connection.commit();
        return { conflict: false };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async setLifecycle(id, nextStatus, actorId, action, note = null, deleteDraft = false, expectedUpdatedAt = null, scheduledAt = null) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT status, published_at, updated_at FROM posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!rows[0]) {throw new Error("Post not found.");}
        const [matches] = expectedUpdatedAt ? await connection.execute("SELECT id FROM posts WHERE id = ? AND updated_at = ? AND deleted_at IS NULL", [id, expectedUpdatedAt]) : [[]];
        if (!matches.length) { await connection.rollback(); return { conflict: true }; }
        await connection.execute("UPDATE posts SET status = ?, scheduled_at = IF(? = 'schedule', ?, IF(? = 'publish', NULL, scheduled_at)), published_at = IF(? = 'publish', COALESCE(published_at, UTC_TIMESTAMP()), published_at), review_note = IF(? = 'reject', ?, review_note), deleted_at = IF(? = 1, UTC_TIMESTAMP(), deleted_at), updated_at = GREATEST(UTC_TIMESTAMP(), DATE_ADD(updated_at, INTERVAL 1 SECOND)) WHERE id = ?", [nextStatus, action, scheduledAt, action, action, action, note, deleteDraft ? 1 : 0, id]);
        await connection.execute("INSERT INTO post_revisions (post_id, title, content_html, edited_by) SELECT id, title, content_html, ? FROM posts WHERE id = ?", [actorId, id]);
        await connection.execute("DELETE FROM post_revisions WHERE post_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 50) kept)", [id, id]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, ?, 'post', ?, NULL)", [actorId, `post.${action}`, String(id)]);
        await connection.commit();
        return { oldStatus: rows[0].status, published: nextStatus === "published", archived: nextStatus === "archived" };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async conflictActor(id) {
      const [rows] = await database.execute("SELECT COALESCE(NULLIF(u.display_name, ''), u.email) AS name, a.created_at FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.entity_type = 'post' AND a.entity_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 1", [String(id)]);
      return rows[0] ?? null;
    },
    async revisions(id) { const [rows] = await database.execute("SELECT r.id, r.title, r.created_at, r.edited_by, COALESCE(NULLIF(u.display_name, ''), u.email, 'Unknown user') AS editor_name FROM post_revisions r LEFT JOIN users u ON u.id = r.edited_by WHERE r.post_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 50", [id]); return rows; },
    async getRevision(postId, revisionId) { const [rows] = await database.execute("SELECT title, content_html FROM post_revisions WHERE id = ? AND post_id = ?", [revisionId, postId]); return rows[0] ?? null; },
    async inlineMediaCredits(postId) { const [rows] = await database.execute("SELECT m.file_name, m.credit_text, m.credit_url FROM media m JOIN posts p ON p.id = ? WHERE m.credit_text IS NOT NULL AND LOCATE(m.file_name, COALESCE(p.content_html, '')) > 0", [postId]); return rows; },
    async restoreRevision(postId, revisionId, actorId, expectedUpdatedAt, restored, ip) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [postRows] = await connection.execute("SELECT id, updated_at FROM posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [postId]);
        if (!postRows[0] || postRows[0].updated_at.toISOString().slice(0, 19).replace("T", " ") !== expectedUpdatedAt) { await connection.rollback(); return { conflict: true }; }
        if (!restored) { throw new Error("Revision not found."); }
        await connection.execute("UPDATE posts SET title = ?, content_html = ?, content_text = ?, excerpt = ?, reading_minutes = ?, updated_at = GREATEST(UTC_TIMESTAMP(), DATE_ADD(updated_at, INTERVAL 1 SECOND)) WHERE id = ?", [restored.title, restored.content_html, restored.content_text, restored.excerpt, restored.reading_minutes, postId]);
        await connection.execute("INSERT INTO post_revisions (post_id, title, content_html, edited_by) VALUES (?, ?, ?, ?)", [postId, restored.title, restored.content_html, actorId]);
        await connection.execute("DELETE FROM post_revisions WHERE post_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 50) kept)", [postId, postId]);
        await connection.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, 'post.restore_revision', 'post', ?, ?)", [actorId, String(postId), ip ?? null]);
        await connection.commit(); return { conflict: false };
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async writeAudit(entry) { await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip) VALUES (?, ?, ?, ?, ?, ?)", [entry.actorId, entry.action, entry.entityType, entry.entityId, entry.meta ? JSON.stringify(entry.meta) : null, entry.ip ?? null]); },
    async findOrCreateTag(name, slug) {
      const connection = await database.getConnection();
      try { await connection.beginTransaction(); const [rows] = await connection.execute("SELECT id,name,slug FROM tags WHERE slug = ? LIMIT 1 FOR UPDATE", [slug]); if (rows[0]) { await connection.commit(); return rows[0]; } const [result] = await connection.execute("INSERT INTO tags (name,slug) VALUES (?,?)", [name,slug]); await connection.commit(); return { id: result.insertId,name,slug }; }
      catch (error) { await connection.rollback(); if (error.code === "ER_DUP_ENTRY") { const [rows] = await database.execute("SELECT id,name,slug FROM tags WHERE slug = ? LIMIT 1", [slug]); if (rows[0]) {return rows[0];} } throw error; } finally { connection.release(); }
    },
    async slugInUse(slug, excludeId = null) {
      const [rows] = await database.execute("SELECT id FROM posts WHERE slug = ? AND deleted_at IS NULL AND (? IS NULL OR id <> ?) LIMIT 1", [slug, excludeId, excludeId]); return Boolean(rows.length);
    },
    async pageSlugExists(slug) { const [rows] = await database.execute("SELECT id FROM pages WHERE slug = ? LIMIT 1", [slug]); return Boolean(rows.length); },
    async categories() { const [rows] = await database.execute("SELECT id, name, slug FROM categories ORDER BY sort_order, name"); return rows; },
    async authors() { const [rows] = await database.execute("SELECT id, display_name FROM authors ORDER BY display_name"); return rows; },
    async validatePublish(id) {
      const [rows] = await database.execute("SELECT p.title, p.slug, p.content_text, p.seo_description, p.category_id, m.alt_text FROM posts p LEFT JOIN media m ON m.id = p.cover_media_id WHERE p.id = ?", [id]);
      const post = rows[0]; if (!post) {return ["post"];}
      return [!post.title?.trim() && "title", !post.slug?.trim() && "slug", (!post.alt_text?.trim()) && "cover image with alt text", !post.category_id && "category", !post.content_text?.trim() && "body", (!post.seo_description?.trim() || post.seo_description.length > 160) && "meta description"].filter(Boolean);
    },
    async suggest({ query, userId, role, limit = 8 }) {
      const own = role === "editor";
      const [rows] = await database.execute("SELECT id, title, status FROM posts WHERE deleted_at IS NULL AND (? = 0 OR created_by = ?) AND title LIKE CONCAT('%', ?, '%') ORDER BY updated_at DESC, id DESC LIMIT ?", [own ? 1 : 0, userId, query, limit]);
      return rows;
    },
    async listCategories() { const [rows] = await database.execute("SELECT c.id, c.name, c.slug, c.description, c.sort_order, c.show_in_nav, COUNT(p.id) AS post_count FROM categories c LEFT JOIN posts p ON p.category_id = c.id GROUP BY c.id ORDER BY c.sort_order, c.name"); return rows; },
    async addCategory(data) { const [result] = await database.execute("INSERT INTO categories (name, slug, description, sort_order, show_in_nav) VALUES (?, ?, ?, ?, ?)", [data.name, data.slug, data.description, data.sort_order, data.show_in_nav]); return result.insertId; },
    async categorySlugInUse(slug, excludeId = null) { const [rows] = await database.execute("SELECT id FROM categories WHERE slug = ? AND (? IS NULL OR id <> ?) LIMIT 1", [slug, excludeId, excludeId]); return Boolean(rows.length); },
    async updateCategory(id, data) { await database.execute("UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ?, show_in_nav = ? WHERE id = ?", [data.name, data.slug, data.description, data.sort_order, data.show_in_nav, id]); },
    async deleteCategory(id) { const [result] = await database.execute("DELETE FROM categories WHERE id = ? AND NOT EXISTS (SELECT 1 FROM posts WHERE category_id = ?)", [id, id]); return result.affectedRows > 0; },
    async auditCategory(actorId, action, id, ip) { await database.execute("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, ip) VALUES (?, ?, 'category', ?, ?)", [actorId, action, String(id), ip]); },
    async dashboard({ userId, role, status, search, postId = null, offset, limit }) {
      const own = role === "editor";
      const [counts] = await database.execute("SELECT SUM(p.status = 'published') published, SUM(p.status = 'in_review') in_review, SUM(p.status = 'draft') drafts, COALESCE((SELECT SUM(v.views) FROM post_daily_views v JOIN posts pv ON pv.id = v.post_id WHERE v.day >= UTC_DATE() - INTERVAL 6 DAY AND pv.deleted_at IS NULL AND (? = 0 OR pv.created_by = ?)),0) views FROM posts p WHERE p.deleted_at IS NULL AND (? = 0 OR p.created_by = ?)", [own ? 1 : 0, userId, own ? 1 : 0, userId]);
      const [reviewRows] = await database.execute("SELECT COUNT(*) total FROM posts p WHERE p.deleted_at IS NULL AND p.status = 'in_review' AND (? = 0 OR p.created_by = ?)", [own ? 1 : 0, userId]);
      const [rows] = await database.execute("SELECT p.id,p.title,p.author_id,p.status,p.updated_at,p.blogger_post_id,p.blogger_url,p.blogger_sync_status,p.blogger_last_error,a.display_name AS author_name,COALESCE(v.views,0) AS views FROM posts p LEFT JOIN authors a ON a.id=p.author_id LEFT JOIN (SELECT post_id,SUM(views) views FROM post_daily_views WHERE day >= UTC_DATE() - INTERVAL 6 DAY GROUP BY post_id) v ON v.post_id=p.id WHERE p.deleted_at IS NULL AND (? = 0 OR p.created_by = ?) AND (? = '' OR p.status = ?) AND (? = '' OR p.title LIKE CONCAT('%', ?, '%')) AND (? IS NULL OR p.id = ?) ORDER BY p.updated_at DESC LIMIT ? OFFSET ?", [own ? 1 : 0,userId,status,status,search,search,postId,postId,limit,offset]);
      const [totalRows] = await database.execute("SELECT COUNT(*) total FROM posts p WHERE p.deleted_at IS NULL AND (? = 0 OR p.created_by = ?) AND (? = '' OR p.status = ?) AND (? = '' OR p.title LIKE CONCAT('%', ?, '%')) AND (? IS NULL OR p.id = ?)", [own ? 1 : 0,userId,status,status,search,search,postId,postId]);
      return { counts: counts[0], reviewCount: reviewRows[0].total, rows, total: totalRows[0].total };
    },
  };
}
