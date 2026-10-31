import assert from "node:assert/strict";
import test from "node:test";
import { createHealthController } from "./controller.js";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("health handler reports success only after the database check succeeds", async () => {
  const controller = createHealthController({ check: async () => {} });
  const response = createResponse();

  await controller.show({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("health handler reports unavailable when the database check fails", async () => {
  const controller = createHealthController({
    check: async () => {
      throw new Error("database unavailable");
    },
  });
  const response = createResponse();

  await controller.show({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { status: "unavailable" });
});
