import { pool } from "../../db/pool.js";

export function createCommentsRepository(database = pool) {
  return {
    async postForComments(postId) {
      const [rows] = await database.execute("SELECT p.id, p.allow_comments, p.published_at, p.status, p.deleted_at, COALESCE(JSON_EXTRACT(s.setting_value, '$.closeAfterDays'), 0) AS close_after_days FROM posts p LEFT JOIN site_settings s ON s.setting_key = ? WHERE p.id = ? AND p.status = ? AND p.published_at <= UTC_TIMESTAMP() AND p.deleted_at IS NULL LIMIT 1", ["comments", postId, "published"]);
      return rows[0] ?? null;
    },
    async approvedCommentExists(email) {
      const [rows] = await database.execute("SELECT id FROM comments WHERE author_email = ? AND status = ? LIMIT 1", [email, "approved"]);
      return Boolean(rows[0]);
    },
    async repeatedComment(postId, voterHash, body) {
      const [rows] = await database.execute("SELECT id FROM comments WHERE post_id = ? AND voter_hash = ? AND body = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) LIMIT 1", [postId, voterHash, body]);
      return Boolean(rows[0]);
    },
    async recentCommentCount(voterHash) {
      const [rows] = await database.execute("SELECT COUNT(*) AS total FROM comments WHERE voter_hash = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)", [voterHash]);
      return Number(rows[0]?.total ?? 0);
    },
    async parentDepth(postId, parentId) {
      const [rows] = await database.execute("SELECT c.id, c.parent_id, p.id AS post_id FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ? AND c.post_id = ? AND c.status = ? LIMIT 1", [parentId, postId, "approved"]);
      if (!rows[0]) { return null; }
      let depth = 1;
      let cursor = rows[0];
      while (cursor.parent_id && depth < 4) {
        const [parents] = await database.execute("SELECT id, parent_id FROM comments WHERE id = ? AND post_id = ? AND status = ? LIMIT 1", [cursor.parent_id, postId, "approved"]);
        cursor = parents[0];
        if (!cursor) { return null; }
        depth += 1;
      }
      return depth;
    },
    async levelThreeParent(postId, parentId) {
      const [rows] = await database.execute("SELECT id, parent_id FROM comments WHERE id = ? AND post_id = ? AND status = ? LIMIT 1", [parentId, postId, "approved"]);
      let cursor = rows[0];
      let depth = cursor ? 1 : 0;
      while (cursor?.parent_id && depth < 3) {
        const [parents] = await database.execute("SELECT id, parent_id FROM comments WHERE id = ? AND post_id = ? AND status = ? LIMIT 1", [cursor.parent_id, postId, "approved"]);
        cursor = parents[0];
        if (!cursor) { return null; }
        depth += 1;
      }
      return depth === 3 ? cursor.id : null;
    },
    async insertComment(comment) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute("INSERT INTO comments (post_id, parent_id, author_name, author_email, body, status, is_staff, voter_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [comment.postId, comment.parentId, comment.name, comment.email, comment.body, comment.status, comment.isStaff ? 1 : 0, comment.voterHash]);
        if (comment.status === "approved") { await connection.execute("UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?", [comment.postId]); }
        await connection.commit();
        return result.insertId;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async listApproved(postId, sort, offset, limit) {
      const order = sort === "oldest" ? "created_at ASC, id ASC" : sort === "voted" ? "vote_score DESC, created_at DESC, id DESC" : "created_at DESC, id DESC";
      const [rows] = await database.execute(`SELECT id, parent_id, author_name, body, is_staff, vote_score, created_at FROM comments WHERE post_id = ? AND status = ? ORDER BY ${order} LIMIT ? OFFSET ?`, [postId, "approved", limit, offset]);
      return rows;
    },
    async postSlug(postId) {
      const [rows] = await database.execute("SELECT slug FROM posts WHERE id = ? LIMIT 1", [postId]);
      return rows[0]?.slug ?? null;
    },
    async listPending() {
      const [rows] = await database.execute("SELECT c.id, c.post_id, c.parent_id, c.author_name, c.body, c.status, c.created_at, p.title AS post_title FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.status IN (?, ?) ORDER BY (c.status = ?) DESC, c.created_at ASC, c.id ASC LIMIT 200", ["pending", "approved", "pending"]);
      return rows;
    },
    async approvedParent(postId, parentId) {
      const [rows] = await database.execute("SELECT id, post_id FROM comments WHERE post_id = ? AND id = ? AND status = ? LIMIT 1", [postId, parentId, "approved"]);
      return rows[0] ?? null;
    },
    async voteComment(commentId, voterHash, value) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [found] = await connection.execute("SELECT id FROM comments WHERE id = ? AND status = ? FOR UPDATE", [commentId, "approved"]);
        if (!found[0]) { await connection.rollback(); return false; }
        await connection.execute("INSERT INTO comment_votes (comment_id, voter_hash, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [commentId, voterHash, value]);
        await connection.execute("UPDATE comments SET vote_score = (SELECT COALESCE(SUM(value), 0) FROM comment_votes WHERE comment_id = ?) WHERE id = ?", [commentId, commentId]);
        await connection.commit();
        return true;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async moderate(commentId, status) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT post_id, status FROM comments WHERE id = ? FOR UPDATE", [commentId]);
        if (!rows[0] || rows[0].status === status) { await connection.rollback(); return false; }
        await connection.execute("UPDATE comments SET status = ? WHERE id = ?", [status, commentId]);
        if (rows[0].status === "approved") { await connection.execute("UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?", [rows[0].post_id]); }
        if (status === "approved") { await connection.execute("UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?", [rows[0].post_id]); }
        await connection.commit();
        return true;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
  };
}
