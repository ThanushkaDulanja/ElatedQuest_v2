import assert from "node:assert/strict";
import test from "node:test";
import { validateAuthor } from "./validators.js";
import { createAuthorsService } from "./service.js";
import { createAuthorsRepository } from "./repository.js";

test("author validator accepts and normalizes show_on_about checkbox", () => {
  assert.equal(validateAuthor({ display_name: "Reader", bio: "Writer", show_on_about: "1" }).showOnAbout, 1);
  assert.equal(validateAuthor({ display_name: "Reader", show_on_about: "" }).showOnAbout, 0);
  assert.equal(validateAuthor({ display_name: "Reader", avatar_media_id: "17" }).avatarMediaId, 17);
  assert.throws(() => validateAuthor({ display_name: "Reader", avatar_media_id: "invalid" }), /valid avatar image/u);
});

test("author validator enforces application name and bio limits", () => {
  assert.throws(() => validateAuthor({ display_name: "x".repeat(121) }), /120 characters/);
  assert.throws(() => validateAuthor({ display_name: "Okay", bio: "x".repeat(501) }), /500 characters/);
});

test("About page lists only opted-in authors and makes avatar URLs public", async () => {
  let called = false;
  const service = createAuthorsService({ async listAbout() { called = true; return [{ display_name: "Ada Writer", slug: "ada-writer", avatar_url: "/uploads/ada.webp" }]; } }, { uploadsPublicUrl: "https://media.example.test/uploads" });
  const authors = await service.publicTeam();
  assert.equal(called, true);
  assert.equal(authors[0].avatar_url, "https://media.example.test/uploads/ada.webp");
  assert.equal(authors[0].initials, "AW");
});

test("About author query selects only profiles the owner chose to show", async () => {
  let call;
  const repository = createAuthorsRepository({ async execute(sql, values) { call = { sql, values }; return [[]]; } });
  await repository.listAbout();
  assert.match(call.sql, /a\.show_on_about = 1/u);
  assert.match(call.sql, /LEFT JOIN media/u);
  assert.deepEqual(call.values ?? [], []);
});

test("profile and guest author changes are audited", async () => {
  const events = [];
  const repository = {
    async findForUser() { return null; },
    async findById() { return null; },
    async findSlug() { return null; },
    async save(_author, values) { assert.equal(values.showOnAbout, 1); return 5; },
    async updateUserDisplayName(userId, displayName) { assert.deepEqual([userId, displayName], [3, "Writer"]); },
    async saveGuest() { return 6; },
    async writeAudit(entry) { events.push(entry.action); },
  };
  const service = createAuthorsService(repository);
  const values = { displayName: "Writer", bio: null, showOnAbout: 1 };
  await service.saveProfile({ id: 3, role: "editor" }, values, { ip: "127.0.0.1" });
  await service.saveGuest(values, { ip: "127.0.0.1" }, null, { id: 1 });
  assert.deepEqual(events, ["author.update", "author.create"]);
});
