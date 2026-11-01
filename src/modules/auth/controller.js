import { randomBytes } from "node:crypto";

const GENERIC_EMAIL_MESSAGE =
  "If this email is invited, a sign-in link is on its way. It expires in 15 minutes.";
const GENERIC_GOOGLE_MESSAGE = "Sign-in failed, or this account isn't invited.";

export function createAuthController({
  service,
  repository,
  oauthClient,
  generateCsrfToken = () => "test-token",
}) {
  return {
    async showLogin(request, response) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      if (request.session?.userId) {
        const user = await repository.findUserById(request.session.userId);
        if (user?.status === "active") {
          return response.redirect("/aadmin");
        }
      }
      return renderLogin(request, response, null, null);
    },
    async beginGoogle(request, response) {
      if (await limitLogin(request, response, repository, service)) {
        return;
      }
      const state = randomValue();
      const nonce = randomValue();
      request.session.oauthState = state;
      request.session.oauthNonce = nonce;
      response.redirect(
        oauthClient.generateAuthUrl({
          response_type: "code",
          scope: ["openid", "email", "profile"],
          state,
          nonce,
        }),
      );
    },
    async googleCallback(request, response) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      let reachedLogin = false;
      try {
        if (await limitLogin(request, response, repository, service)) {
          return;
        }
        const { code, state } = request.query;
        if (
          !code ||
          !state ||
          !request.session.oauthState ||
          !constantEqual(state, request.session.oauthState)
        ) {
          throw new Error("Invalid OAuth state");
        }
        const nonce = request.session.oauthNonce;
        delete request.session.oauthState;
        delete request.session.oauthNonce;
        const { tokens } = await oauthClient.getToken(String(code));
        const ticket = await oauthClient.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (
          !payload?.email ||
          payload.email_verified !== true ||
          !constantEqual(payload.nonce, nonce)
        ) {
          throw new Error("Invalid identity");
        }
        reachedLogin = true;
        const user = await service.login(
          payload.email,
          payload.name ?? null,
          request,
        );
        if (!user) {
          throw new Error("Not invited");
        }
        await establishSession(request, user);
        return response.redirect("/aadmin");
      } catch {
        if (!reachedLogin) {
          await service.audit("auth.denied", request);
        }
        return response.status(401).render("admin/login.njk", {
          emailMessage: null,
          googleMessage: GENERIC_GOOGLE_MESSAGE,
          csrfToken: generateCsrfToken(request, response),
        });
      }
    },
    async requestEmail(request, response) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      if (await limitLogin(request, response, repository, service)) {
        return;
      }
      try {
        const result = await service.requestEmailLink(
          String(request.body.email ?? ""),
          request,
        );
        if (result.limited) {
          await service.audit("auth.denied", request);
          response
            .status(429)
            .type("text/plain")
            .send("Too many sign-in attempts. Try again later.");
          return;
        }
      } catch {
        // Do not expose whether an address is invited or whether SMTP is configured.
      }
      return response.status(200).render("admin/login.njk", {
        emailMessage: GENERIC_EMAIL_MESSAGE,
        googleMessage: null,
        csrfToken: generateCsrfToken(request, response),
      });
    },
    async redeemEmail(request, response) {
      return redeem(request, response, "email_link");
    },
    async redeemOwner(request, response) {
      return redeem(request, response, "owner_link");
    },
    async signOut(request, response) {
      request.session.destroy(() => {
        response.clearCookie("elatedquest.sid");
        response.redirect("/aadmin/login");
      });
    },
    async dashboard(request, response) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      return response.render("admin/shell.njk", {
        user: request.user,
        csrfToken: generateCsrfToken(request, response),
      });
    },
  };

  async function redeem(request, response, kind) {
    response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    if (await limitLogin(request, response, repository, service)) {
      return;
    }
    const user = await service.redeemToken(
      kind,
      String(request.query.token ?? ""),
      request,
    );
    if (!user) {
      return response.status(401).render("admin/login.njk", {
        emailMessage: null,
        googleMessage: GENERIC_GOOGLE_MESSAGE,
        csrfToken: generateCsrfToken(request, response),
      });
    }
    await establishSession(request, user);
    return response.redirect("/aadmin");
  }

  function renderLogin(request, response, emailMessage, googleMessage) {
    request.session.csrfReady = true;
    return response.render("admin/login.njk", {
      emailMessage,
      googleMessage,
      csrfToken: generateCsrfToken(request, response),
    });
  }
}

async function limitLogin(request, response, repository, service) {
  const limit = await repository.incrementRateLimit(
    `auth-ip:${request.ip}`,
    10,
    15 * 60 * 1000,
  );
  if (limit.allowed) {
    return false;
  }
  await service.audit("auth.denied", request);
  response
    .status(429)
    .type("text/plain")
    .send("Too many sign-in attempts. Try again later.");
  return true;
}

async function establishSession(request, user) {
  await new Promise((resolve, reject) =>
    request.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  request.session.userId = user.id;
  await new Promise((resolve, reject) =>
    request.session.save((error) => (error ? reject(error) : resolve())),
  );
}

function randomValue() {
  return randomBytes(32).toString("base64url");
}

function constantEqual(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length !== right.length
  ) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
