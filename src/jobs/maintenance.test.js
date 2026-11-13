import assert from "node:assert/strict";
import test from "node:test";
import { createMaintenanceRepository, runCleanup, runRecount } from "./maintenance.js";

test("cleanup removes expired tokens, sessions, old deleted drafts, old limits and old audit rows", async () => {
  const statements = [];
  const repository = createMaintenanceRepository({ async execute(sql) { statements.push(sql); return [{ affectedRows: 2 }]; } });
  assert.equal(await repository.cleanup(), 10);
  assert.equal(statements.length, 5);
  assert.match(statements[0], /login_tokens.*expires_at/u);
  assert.match(statements[1], /sessions.*UNIX_TIMESTAMP/u);
  assert.match(statements[2], /deleted_at.*30 DAY/u);
  assert.match(statements[3], /rate_limits.*1 DAY/u);
  assert.match(statements[4], /audit_log.*12 MONTH/u);
});

test("recount rebuilds view, approved comment and rating aggregates from source rows", async () => {
  const statements = [];
  await runRecount(createMaintenanceRepository({ async execute(sql) { statements.push(sql); return [{}]; } }));
  assert.equal(statements.length, 3);
  assert.match(statements[0], /SUM\(v\.views\).*post_daily_views/u);
  assert.match(statements[1], /COUNT\(\*\).*comments.*approved/u);
  assert.match(statements[2], /rating_count.*post_ratings/u);
});

test("job entry points invoke the repository operation", async () => {
  let cleaned = false;
  let recounted = false;
  assert.equal(await runCleanup({ async cleanup() { cleaned = true; return 4; } }), 4);
  await runRecount({ async recount() { recounted = true; } });
  assert.equal(cleaned && recounted, true);
});
