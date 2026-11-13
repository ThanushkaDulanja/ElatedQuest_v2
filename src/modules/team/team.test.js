import assert from "node:assert/strict";
import test from "node:test";
import { createTeamService } from "./service.js";
import { createTeamRepository } from "./repository.js";
import { validateInviteEmail } from "./validators.js";

test("team invite normalizes email and records invite action", async () => {
  const events = [];
  const service = createTeamService({ repository: { async findByEmail() { return null; }, async invite(email) { events.push(["invite", email]); return 12; }, async writeAudit(entry) { events.push(["audit", entry.action]); } }, ownerEmail: "owner@example.test", emailer: { async sendInviteNotice(email) { events.push(["mail", email]); } } });
  await service.invite(validateInviteEmail("  EDITOR@Example.Test "), { id: 1 }, { ip: "127.0.0.1" });
  assert.deepEqual(events.map((entry) => entry[0]), ["invite", "audit", "mail"]);
  assert.equal(events[0][1], "editor@example.test");
  assert.equal(events[1][1], "team.invite");
});

test("invite repository inserts an invited editor row", async () => {
  let query;
  const repository = createTeamRepository({ async execute(sql, values) { query = { sql, values }; return [{ insertId: 17 }]; } });
  const email = validateInviteEmail(" EDITOR@Example.Test ");
  assert.equal(await repository.invite(email, 4), 17);
  assert.match(query.sql, /'editor', 'invited'/);
  assert.deepEqual(query.values, ["editor@example.test", 4]);
});

test("owner account cannot be removed", async () => {
  const service = createTeamService({ repository: {}, ownerEmail: "owner@example.test", emailer: {} });
  await assert.rejects(service.remove(2, { id: 2 }, 2, {}), /admin account is locked/i);
});

test("owner row cannot be disabled or enabled by the team repository", async () => {
  let statement = "";
  const repository = createTeamRepository({ async execute(sql) { statement = sql; return [{ affectedRows: 0 }]; } });
  assert.equal(await repository.setStatus(1, "disabled"), false);
  assert.match(statement, /role = 'editor'/);
});

test("team disable, enable and remove actions are audited", async () => {
  const actions = [];
  const service = createTeamService({ repository: { async setStatus() { return true; }, async remove() {}, async writeAudit(entry) { actions.push(entry.action); } }, ownerEmail: "owner@example.test", emailer: {} });
  const actor = { id: 2 };
  const request = { ip: "127.0.0.1" };
  await service.changeStatus(8, "disabled", actor, request);
  await service.changeStatus(8, "active", actor, request);
  await service.remove(8, actor, 2, request);
  assert.deepEqual(actions, ["team.disable", "team.enable", "team.remove"]);
});

test("removing an editor reassigns bylined and created posts to owner", async () => {
  const statements = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql) { statements.push(sql); if (sql.includes("SELECT id, role")) {return [[{ id: 7, role: "editor" }]];} if (sql.includes("SELECT id FROM authors")) {return [[{ id: 4 }]];} return [{ affectedRows: 1 }]; },
  };
  const repository = createTeamRepository({ getConnection: async () => connection });
  await repository.remove(7, 2);
  assert.ok(statements.some((sql) => sql.includes("SET p.author_id = ? WHERE a.user_id = ?")));
  assert.ok(statements.some((sql) => sql.includes("SET created_by = ? WHERE created_by = ?")));
  assert.ok(statements.some((sql) => sql.startsWith("DELETE FROM users")));
});

test("team last sign-in is formatted in the configured time zone and never-sign-in stays empty", async () => {
  const service = createTeamService({
    repository: { async list() { return [
      { id: 1, last_login_at: new Date("2026-11-02T16:46:28.000Z") },
      { id: 2, last_login_at: null },
    ]; } },
    ownerEmail: "owner@example.test",
    emailer: {},
    settingsService: { async get() { return { general: { timezone: "Asia/Colombo" } }; } },
  });
  const rows = await service.list();
  assert.equal(rows[0].last_login_display, "02/11/2026 22:16:28");
  assert.equal(rows[1].last_login_display, null);
});
