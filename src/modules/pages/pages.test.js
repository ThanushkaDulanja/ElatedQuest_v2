import assert from "node:assert/strict";
import test from "node:test";
import { createPagesService } from "./service.js";

test("static page editor sanitizes HTML and only accepts seeded page slugs", async () => {
  let saved;
  const service = createPagesService({
    async find(slug) { return slug === "about-us" ? { slug, title: "About" } : null; },
    async save(...args) { saved = args; },
  });
  await service.update("about-us", { title: " About us ", content_html: '<p>Safe</p><script>alert(1)</script><img src="x" onerror="bad()">' }, 4, "127.0.0.1");
  assert.equal(saved[0], "about-us");
  assert.equal(saved[1], "About us");
  assert.match(saved[2], /<p>Safe<\/p>/u);
  assert.doesNotMatch(saved[2], /script|onerror/u);
  assert.equal(saved[3], 4);
  await assert.rejects(service.update("new-page", { title: "New", content_html: "<p>Text</p>" }, 4), { status: 404 });
  await assert.rejects(service.update("about-us", { title: " ", content_html: "" }, 4), /Title is required/u);
});

test("untouched starter pages show improved defaults in public pages and the admin editor", async () => {
  const original = "<p>Replace with your privacy policy: analytics, ads and cookies, email collection, comments, services used and a contact address.</p>";
  const service = createPagesService({
    async find(slug) { return slug === "privacy-policy" ? { slug, title: "Privacy Policy", content_html: original } : null; },
    async list() { return [{ slug: "privacy-policy", title: "Privacy Policy", content_html: original }]; },
  });
  assert.match((await service.get("privacy-policy")).content_html, /Information you provide/u);
  assert.match((await service.list())[0].content_html, /Cookies and service providers/u);

  const custom = createPagesService({
    async find(slug) { return { slug, title: "Privacy Policy", content_html: "<p>Owner-written policy</p>" }; },
  });
  assert.equal((await custom.get("privacy-policy")).content_html, "<p>Owner-written policy</p>");
});

test("page editor requires an existing seeded page and caps content size", async () => {
  const service = createPagesService({ async find() { return null; }, async save() { assert.fail("must not save missing page"); } });
  await assert.rejects(service.update("terms", { title: "Terms", content_html: "x" }, 1), { status: 404 });
  const found = createPagesService({ async find() { return { slug: "terms" }; }, async save() { assert.fail("must not save oversized content"); } });
  await assert.rejects(found.update("terms", { title: "Terms", content_html: "x".repeat(100_001) }, 1), /100,000/u);
});
