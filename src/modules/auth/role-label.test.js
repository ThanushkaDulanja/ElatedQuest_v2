import assert from "node:assert/strict";
import test from "node:test";
import { roleLabel } from "./role-label.js";

test("role labels change without changing authorization identifiers", () => {
  assert.equal(roleLabel("owner"), "Admin");
  assert.equal(roleLabel("editor"), "Content Moderator");
  assert.equal(roleLabel("reader"), "reader");
});
