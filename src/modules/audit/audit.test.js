import assert from "node:assert/strict";
import test from "node:test";
import { createAuditService } from "./service.js";
import { createAuditRepository } from "./repository.js";
import { toDmy, toIso } from "../../../public/js/features/audit-date-filters.js";

const colomboSettings = { async get() { return { general: { timezone: "Asia/Colombo" } }; } };

test("audit filters normalize dd/mm/yyyy and convert local day boundaries to UTC", async () => {
  let options;
  const service = createAuditService({
    async filters() { return { actors: [], actions: [] }; },
    async list(value) { options = value; return []; },
  }, colomboSettings);
  const result = await service.get({ actor: "12", action: "team.invite", from: "02/11/2026", to: "03/11/2026" });
  assert.deepEqual(options, {
    actor: "12",
    action: "team.invite",
    from: "2026-11-01 18:30:00",
    to: "2026-11-03 18:30:00",
  });
  assert.deepEqual(result.filters, { actor: "12", action: "team.invite", from: "02/11/2026", to: "03/11/2026", fromIso: "2026-11-02", toIso: "2026-11-03" });
  assert.equal(result.timeZone, "Asia/Colombo");
});

test("single-day filters include the complete Sri Lanka calendar date", async () => {
  let options;
  const service = createAuditService({
    async filters() { return { actors: [], actions: [] }; },
    async list(value) { options = value; return []; },
  }, colomboSettings);
  await service.get({ from: "02/11/2026", to: "02/11/2026" });
  assert.equal(options.from, "2026-11-01 18:30:00");
  assert.equal(options.to, "2026-11-02 18:30:00");
});

test("audit timestamps display in the configured time zone as dd/mm/yyyy", async () => {
  const service = createAuditService({
    async filters() { return { actors: [], actions: [] }; },
    async list() { return [{ created_at: new Date("2026-11-02T16:46:28.000Z") }]; },
  }, colomboSettings);
  const result = await service.get({});
  assert.equal(result.rows[0].created_at, "02/11/2026 22:16:28");
});

test("audit accepts older ISO date links and rejects invalid or reversed dates", async () => {
  const service = createAuditService({
    async filters() { return { actors: [], actions: [] }; },
    async list() { return []; },
  }, colomboSettings);
  const result = await service.get({ from: "2026-11-02", to: "2026-11-02" });
  assert.equal(result.filters.from, "02/11/2026");
  await assert.rejects(service.get({ from: "31/02/2026" }), /valid dates/);
  await assert.rejects(service.get({ from: "03/11/2026", to: "02/11/2026" }), /on or before/);
  await assert.rejects(service.get({ from: "02-11-2026" }), /dd\/mm\/yyyy/);
});

test("audit repository binds all filter values and uses UTC half-open boundaries", async () => {
  let query;
  const repository = createAuditRepository({ async execute(sql, values) { query = { sql, values }; return [[]]; } });
  await repository.list({ actor: "12", action: "auth.login", from: "2026-11-01 18:30:00", to: "2026-11-02 18:30:00" });
  assert.deepEqual(query.values, ["12", "12", "auth.login", "auth.login", "2026-11-01 18:30:00", "2026-11-01 18:30:00", "2026-11-02 18:30:00", "2026-11-02 18:30:00"]);
  assert.match(query.sql, /a\.created_at >= \?/u);
  assert.match(query.sql, /a\.created_at < \?/u);
});

test("date picker conversion preserves dd/mm/yyyy and rejects impossible dates", () => {
  assert.equal(toDmy("2026-11-02"), "02/11/2026");
  assert.equal(toIso("02/11/2026"), "2026-11-02");
  assert.equal(toIso("31/02/2026"), "");
});

test("audit repository resolves existing users/authors to safe meaningful item labels", async () => {
  let query;
  const repository = createAuditRepository({ async execute(sql) { query = sql; return [[]]; } });
  await repository.list({ actor: "", action: "", from: "", to: "" });
  assert.match(query, /LEFT JOIN users eu/u);
  assert.match(query, /LEFT JOIN authors ea/u);
  assert.match(query, /Removed user #/u);
  assert.match(query, /Removed author #/u);
  assert.match(query, /AS entity_label/u);
});
