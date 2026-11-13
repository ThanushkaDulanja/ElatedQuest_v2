import { pool } from "../db/pool.js";

export function createMaintenanceRepository(database = pool) {
  return {
    async cleanup() {
      const results = [];
      results.push(await database.execute("DELETE FROM login_tokens WHERE expires_at <= UTC_TIMESTAMP() OR used_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)"));
      results.push(await database.execute("DELETE FROM sessions WHERE expires < UNIX_TIMESTAMP()"));
      results.push(await database.execute("DELETE FROM posts WHERE status = 'draft' AND deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)"));
      results.push(await database.execute("DELETE FROM rate_limits WHERE window_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)"));
      results.push(await database.execute("DELETE FROM audit_log WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 MONTH)"));
      return results.reduce((count, [result]) => count + Number(result.affectedRows ?? 0), 0);
    },
    async recount() {
      await database.execute("UPDATE posts p SET p.view_count = COALESCE((SELECT SUM(v.views) FROM post_daily_views v WHERE v.post_id = p.id), 0)");
      await database.execute("UPDATE posts p SET p.comment_count = (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'approved')");
      await database.execute("UPDATE posts p SET p.rating_count = (SELECT COUNT(*) FROM post_ratings r WHERE r.post_id = p.id), p.rating_sum = COALESCE((SELECT SUM(r.stars) FROM post_ratings r WHERE r.post_id = p.id), 0)");
    },
  };
}

export async function runCleanup(repository = createMaintenanceRepository()) {
  return repository.cleanup();
}

export async function runRecount(repository = createMaintenanceRepository()) {
  await repository.recount();
}
