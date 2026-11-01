import { createHash, randomBytes } from "node:crypto";
import { normalizeEmail } from "../../lib/email.js";
import { AUTH_LIMITS } from "../../config/constants.js";

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuthService({
  repository,
  ownerEmail,
  hashSecret,
  emailer,
  now = () => Date.now(),
}) {
  async function audit(action, request, user = null) {
    await repository.writeAudit({
      actorId: user?.id ?? null,
      action,
      ip: request?.ip ?? null,
      meta: user ? { email: user.email } : null,
    });
  }

  async function login(emailValue, displayName, request) {
    const email = normalizeEmail(emailValue);
    let user;
    if (email === normalizeEmail(ownerEmail)) {
      user = await repository.provisionOwner(email, displayName ?? null);
    } else {
      user = await repository.activateLogin(email, displayName ?? null);
    }
    if (!user || user.status !== "active") {
      await audit("auth.denied", request);
      return null;
    }
    await audit("auth.login", request, user);
    return user;
  }

  async function requestEmailLink(emailValue, request) {
    const email = normalizeEmail(emailValue);
    const ip = request?.ip ?? "unknown";
    const emailLimit = await repository.incrementRateLimit(
      `email:${hashToken(`${hashSecret}:${email}`)}`,
      AUTH_LIMITS.email.hits,
      AUTH_LIMITS.email.windowMs,
    );
    const ipLimit = await repository.incrementRateLimit(
      `email-ip:${ip}`,
      AUTH_LIMITS.emailIp.hits,
      AUTH_LIMITS.emailIp.windowMs,
    );
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return { limited: true };
    }
    const user = await repository.findUserByEmail(email);
    if (
      email === normalizeEmail(ownerEmail) ||
      (user && user.status !== "disabled")
    ) {
      const token = randomBytes(32).toString("base64url");
      await repository.createLoginToken(
        "email_link",
        email,
        hashToken(token),
        new Date(now() + AUTH_LIMITS.emailLinkMs),
      );
      await emailer.sendSignInLink(email, token);
    } else {
      await audit("auth.denied", request);
    }
    return { limited: false };
  }

  async function redeemToken(kind, token, request) {
    const loginToken =
      typeof token === "string" && /^[A-Za-z0-9_-]{40,50}$/.test(token)
        ? await repository.consumeLoginToken(kind, hashToken(token))
        : null;
    if (
      !loginToken ||
      (kind === "owner_link" &&
        normalizeEmail(loginToken.email) !== normalizeEmail(ownerEmail))
    ) {
      if (kind === "owner_link") {
        await audit("auth.owner_link", request);
      }
      await audit("auth.denied", request);
      return null;
    }
    const user = await login(loginToken.email, null, request);
    if (kind === "owner_link") {
      await audit("auth.owner_link", request, user);
    }
    return user;
  }

  async function createOwnerLink() {
    const email = normalizeEmail(ownerEmail);
    const token = randomBytes(32).toString("base64url");
    await repository.createLoginToken(
      "owner_link",
      email,
      hashToken(token),
      new Date(now() + AUTH_LIMITS.ownerLinkMs),
    );
    return token;
  }

  return { login, requestEmailLink, redeemToken, createOwnerLink, audit };
}
