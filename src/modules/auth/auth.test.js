import assert from "node:assert/strict";
import test from "node:test";
import { createAuthService, hashToken } from "./service.js";
import { createRequireRole } from "./middleware.js";
import { createAuthController } from "./controller.js";
import { normalizeEmail } from "../../lib/email.js";

function fixture(options = {}) {
  const users = new Map();
  const tokens = new Map();
  const limits = new Map();
  const audit = [];
  const sent = [];
  const ownerEmail = options.ownerEmail ?? "owner@example.test";
  const repository = {
    async findUserById(id) {
      return [...users.values()].find((user) => user.id === id) ?? null;
    },
    async findUserByEmail(email) {
      return users.get(email) ?? null;
    },
    async provisionOwner(email) {
      const user = users.get(email) ?? {
        id: users.size + 1,
        email,
        role: "owner",
        status: "active",
      };
      Object.assign(user, { role: "owner", status: "active" });
      users.set(email, user);
      return user;
    },
    async activateLogin(email) {
      const user = users.get(email);
      if (!user || user.status === "disabled") {
        return null;
      }
      user.role = "editor";
      user.status = "active";
      return user;
    },
    async createLoginToken(kind, email, tokenHash, expiresAt) {
      tokens.set(`${kind}:${tokenHash}`, {
        kind,
        email,
        expiresAt,
        used: false,
      });
    },
    async consumeLoginToken(kind, tokenHash) {
      const value = tokens.get(`${kind}:${tokenHash}`);
      if (!value || value.used || value.expiresAt.getTime() <= now()) {
        return null;
      }
      value.used = true;
      return value;
    },
    async incrementRateLimit(key, max) {
      const hits = (limits.get(key) ?? 0) + 1;
      limits.set(key, hits);
      return { allowed: hits <= max };
    },
    async writeAudit(record) {
      audit.push(record);
    },
  };
  let clock = options.now ?? Date.now();
  const now = () => clock;
  const service = createAuthService({
    repository,
    ownerEmail,
    hashSecret: "test-only",
    now,
    emailer: {
      async sendSignInLink(email, token) {
        sent.push({ email, token });
      },
    },
  });
  return {
    users,
    tokens,
    limits,
    audit,
    sent,
    repository,
    service,
    ownerEmail,
    advance(ms) {
      clock += ms;
    },
  };
}

test("normalizeEmail trims and lowercases the shared email identity", () => {
  assert.equal(normalizeEmail("  Owner@Example.Test "), "owner@example.test");
});

test("Google callback rejects unverified, uninvited identities generically and enforces state and nonce", async () => {
  const f = fixture();
  f.users.set("editor@example.test", {
    id: 2,
    email: "editor@example.test",
    role: "editor",
    status: "invited",
  });
  const payload = {
    email: "unknown@example.test",
    email_verified: true,
    nonce: "n-1",
  };
  const controller = createAuthController({
    service: f.service,
    repository: f.repository,
    oauthClient: {
      async getToken() {
        return { tokens: { id_token: "id" } };
      },
      async verifyIdToken() {
        return { getPayload: () => payload };
      },
    },
  });
  const req = {
    query: { code: "code", state: "s-1" },
    session: {
      oauthState: "s-1",
      oauthNonce: "n-1",
      regenerate(cb) {
        cb();
      },
      save(cb) {
        cb();
      },
    },
    ip: "127.0.0.1",
  };
  const response = mockResponse();
  await controller.googleCallback(req, response);
  assert.equal(response.statusCode, 401);
  assert.match(response.viewData.googleMessage, /isn't invited/);
  assert.equal(
    f.audit.filter((event) => event.action === "auth.denied").length,
    1,
  );

  payload.email = "editor@example.test";
  payload.email_verified = false;
  const response2 = mockResponse();
  await controller.googleCallback(
    { ...req, session: { ...req.session } },
    response2,
  );
  assert.equal(response2.statusCode, 401);
  payload.email_verified = true;
  payload.nonce = "wrong";
  const response3 = mockResponse();
  await controller.googleCallback(
    { ...req, session: { ...req.session } },
    response3,
  );
  assert.equal(response3.statusCode, 401);
});

test("verified Google identities sign in an invited editor and the configured owner", async () => {
  const f = fixture();
  f.users.set("editor@example.test", {
    id: 2,
    email: "editor@example.test",
    role: "editor",
    status: "invited",
  });
  let generatedOptions;
  let payload = {
    email: "editor@example.test",
    email_verified: true,
    nonce: "",
  };
  const controller = createAuthController({
    service: f.service,
    repository: f.repository,
    oauthClient: {
      generateAuthUrl: (options) => {
        generatedOptions = options;
        return "https://accounts.google.test/";
      },
      async getToken() {
        return { tokens: { id_token: "signed-id" } };
      },
      async verifyIdToken(options) {
        assert.equal(options.audience, process.env.GOOGLE_CLIENT_ID);
        return { getPayload: () => payload };
      },
    },
  });
  const beginResponse = mockResponse();
  const beginRequest = { session: {}, ip: "g" };
  await controller.beginGoogle(beginRequest, beginResponse);
  payload.nonce = generatedOptions.nonce;
  assert.ok(beginRequest.session.oauthState);
  assert.ok(beginRequest.session.oauthNonce);
  const callbackRequest = {
    query: { code: "code", state: beginRequest.session.oauthState },
    session: {
      ...beginRequest.session,
      regenerate(callback) {
        callback();
      },
      save(callback) {
        callback();
      },
    },
    ip: "g",
  };
  const editorResponse = mockResponse();
  await controller.googleCallback(callbackRequest, editorResponse);
  assert.equal(editorResponse.redirected, "/aadmin");
  assert.equal(callbackRequest.session.userId, 2);

  payload = {
    email: " OWNER@example.test ",
    email_verified: true,
    nonce: "owner-nonce",
  };
  const ownerRequest = {
    query: { code: "code", state: "owner-state" },
    session: {
      oauthState: "owner-state",
      oauthNonce: "owner-nonce",
      regenerate(callback) {
        callback();
      },
      save(callback) {
        callback();
      },
    },
    ip: "owner",
  };
  const ownerResponse = mockResponse();
  await controller.googleCallback(ownerRequest, ownerResponse);
  assert.equal(ownerResponse.redirected, "/aadmin");
  assert.equal(f.users.get("owner@example.test").role, "owner");
});

test("owner and invited editor sign in, email links are hashed, single use, expire at 15 minutes", async () => {
  const f = fixture();
  f.users.set("editor@example.test", {
    id: 2,
    email: "editor@example.test",
    role: "editor",
    status: "invited",
  });
  const owner = await f.service.login(" OWNER@example.test ", "Owner", {
    ip: "1",
  });
  const editor = await f.service.login("editor@example.test", "Editor", {
    ip: "2",
  });
  assert.equal(owner.role, "owner");
  assert.equal(editor.status, "active");
  assert.equal(
    (await f.service.requestEmailLink(" editor@example.test ", { ip: "3" }))
      .limited,
    false,
  );
  const token = f.sent[0].token;
  assert.equal([...f.tokens.keys()][0].endsWith(hashToken(token)), true);
  assert.equal([...f.tokens.keys()][0].includes(token), false);
  const first = await f.service.redeemToken("email_link", token, { ip: "3" });
  assert.equal(first.email, "editor@example.test");
  assert.equal(
    await f.service.redeemToken("email_link", token, { ip: "3" }),
    null,
  );

  await f.service.requestEmailLink("editor@example.test", { ip: "4" });
  f.advance(15 * 60 * 1000);
  assert.equal(
    await f.service.redeemToken("email_link", f.sent[1].token, { ip: "4" }),
    null,
  );
});

test("unknown and invited email link requests return the same public message", async () => {
  const f = fixture();
  f.users.set("editor@example.test", {
    id: 2,
    email: "editor@example.test",
    role: "editor",
    status: "invited",
  });
  const controller = createAuthController({
    service: f.service,
    repository: f.repository,
    oauthClient: {},
  });
  const outputs = [];
  for (const email of ["editor@example.test", "unknown@example.test"]) {
    const response = mockResponse();
    await controller.requestEmail({ body: { email }, ip: email }, response);
    outputs.push([response.statusCode, response.viewData.emailMessage]);
  }
  assert.deepEqual(outputs[0], outputs[1]);
  assert.match(outputs[0][1], /expires in 15 minutes/);
  assert.equal(f.sent.length, 1);
});

test("owner-link is ten-minute single use and follows the current OWNER_EMAIL", async () => {
  const f = fixture({ ownerEmail: "new-owner@example.test" });
  const token = await f.service.createOwnerLink();
  assert.equal(
    await f.service
      .redeemToken("owner_link", token, { ip: "one" })
      .then((user) => user.email),
    "new-owner@example.test",
  );
  assert.equal(
    await f.service.redeemToken("owner_link", token, { ip: "one" }),
    null,
  );
  const expired = await f.service.createOwnerLink();
  f.advance(10 * 60 * 1000);
  assert.equal(
    await f.service.redeemToken("owner_link", expired, { ip: "one" }),
    null,
  );
  const nextOwner = fixture({ ownerEmail: "changed@example.test" });
  assert.equal(
    (await nextOwner.service.login("changed@example.test", null, { ip: "2" }))
      .role,
    "owner",
  );
  nextOwner.users.set("old-owner@example.test", {
    id: 4,
    email: "old-owner@example.test",
    role: "owner",
    status: "active",
  });
  assert.equal(
    (await nextOwner.service.login("old-owner@example.test", null, { ip: "2" }))
      .role,
    "editor",
  );
  await nextOwner.service.requestEmailLink("changed@example.test", { ip: "3" });
  assert.equal(nextOwner.sent.length, 1);
  assert.equal(
    (
      await nextOwner.service.redeemToken(
        "email_link",
        nextOwner.sent[0].token,
        { ip: "3" },
      )
    ).role,
    "owner",
  );
});

test("requireRole reloads status for every request and returns 403 to editors on owner routes", async () => {
  const f = fixture();
  const editor = {
    id: 7,
    email: "e@example.test",
    role: "editor",
    status: "active",
  };
  let current = editor;
  const guard = createRequireRole({
    async findUserById() {
      return current;
    },
  });
  let nextCount = 0;
  const res = mockResponse();
  await guard("owner")({ session: { userId: 7 } }, res, () => {
    nextCount += 1;
  });
  assert.equal(res.statusCode, 403);
  current = { ...editor, status: "disabled" };
  const res2 = mockResponse();
  await guard("editor")({ session: { userId: 7 } }, res2, () => {
    nextCount += 1;
  });
  assert.equal(res2.redirected, "/aadmin/login");
  assert.equal(nextCount, 0);
  assert.equal(f.audit.length, 0);
});

test("requireRole derives owner access from the current OWNER_EMAIL", async () => {
  let current = {
    id: 9,
    email: "changed@example.test",
    role: "editor",
    status: "active",
  };
  const guard = createRequireRole(
    {
      async findUserById() {
        return current;
      },
    },
    "changed@example.test",
  );
  const ownerResponse = mockResponse();
  let reached = false;
  await guard("owner")({ session: { userId: 9 } }, ownerResponse, () => {
    reached = true;
  });
  assert.equal(reached, true);
  current = {
    id: 9,
    email: "previous@example.test",
    role: "owner",
    status: "active",
  };
  const previousResponse = mockResponse();
  await guard("owner")({ session: { userId: 9 } }, previousResponse, () => {
    reached = true;
  });
  assert.equal(previousResponse.statusCode, 403);
});

test("audit events include successful sign-ins and denials; rate limiting reaches 429", async () => {
  const f = fixture();
  f.users.set("ed@example.test", {
    id: 8,
    email: "ed@example.test",
    role: "editor",
    status: "active",
  });
  await f.service.login("ed@example.test", null, { ip: "1.2.3.4" });
  await f.service.login("unknown@example.test", null, { ip: "1.2.3.4" });
  assert.deepEqual(
    f.audit.map(({ action }) => action),
    ["auth.login", "auth.denied"],
  );
  const controller = createAuthController({
    service: f.service,
    repository: {
      async incrementRateLimit() {
        return { allowed: false };
      },
    },
    oauthClient: {},
  });
  const response = mockResponse();
  await controller.beginGoogle({ ip: "9", session: {} }, response);
  assert.equal(response.statusCode, 429);
});

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.view = view;
      this.viewData = data;
      return this;
    },
    redirect(path) {
      this.redirected = path;
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}
