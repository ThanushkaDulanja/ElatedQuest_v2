import { pool } from "../../db/pool.js";

export function createRatingsRepository(database = pool) {
  return {
    async setRating(postId, voterHash, stars) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [posts] = await connection.execute("SELECT id, slug FROM posts WHERE id = ? AND status = ? AND published_at <= UTC_TIMESTAMP() AND deleted_at IS NULL FOR UPDATE", [postId, "published"]);
        if (!posts[0]) { await connection.rollback(); return null; }
        await connection.execute("INSERT INTO post_ratings (post_id, voter_hash, stars) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stars = VALUES(stars)", [postId, voterHash, stars]);
        const [counts] = await connection.execute("SELECT COUNT(*) AS rating_count, COALESCE(SUM(stars), 0) AS rating_sum FROM post_ratings WHERE post_id = ?", [postId]);
        await connection.execute("UPDATE posts SET rating_count = ?, rating_sum = ? WHERE id = ?", [counts[0].rating_count, counts[0].rating_sum, postId]);
        await connection.commit();
        return { count: Number(counts[0].rating_count), sum: Number(counts[0].rating_sum), slug: posts[0].slug };
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
  };
}
