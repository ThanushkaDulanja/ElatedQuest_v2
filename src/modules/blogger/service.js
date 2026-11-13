import { timingSafeEqual, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { encryptRefreshToken, decryptRefreshToken } from "./crypto.js";
import { sanitizePostHtml } from "../../lib/sanitize.js";

const API = "https://www.googleapis.com/blogger/v3";
const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";

function safeError(error) {
  const status = Number(error.response?.status ?? error.code);
  if (status === 401 || isInvalidGrant(error)) { return "Google authorization expired. Reconnect Blogger."; }
  if (status === 403) { return "Google denied Blogger access. Check Blogger API access and the selected blog permissions."; }
  if (status === 429 || status >= 500) { return "Blogger is temporarily unavailable. Try again later."; }
  return String(error.message || "Blogger synchronization failed.").replace(/https?:\/\/\S+/gu, "Google API").slice(0, 500);
}

function isInvalidGrant(error) {
  return error.response?.data?.error === "invalid_grant" || /invalid_grant/iu.test(String(error.response?.data?.error_description ?? error.message ?? ""));
}

export function createBloggerService({ repository, clientId, clientSecret, redirectUri, encryptionKey, siteUrl, oauthClientFactory = () => new OAuth2Client({ clientId, clientSecret, redirectUri }) }) {
  const newClient = () => oauthClientFactory();
  async function blogs(client) {
    const response = await client.request({ url: `${API}/users/self/blogs` });
    return (response.data.items ?? []).map(({ id, name, url }) => ({ id: String(id), name: String(name ?? "Blogger blog"), url: String(url ?? "") }));
  }
  async function clientForConnection(connection) {
    if (!connection?.refresh_token_encrypted) { throw Object.assign(new Error("Blogger is not connected."), { status: 409 }); }
    const client = newClient();
    client.setCredentials({ refresh_token: decryptRefreshToken(connection.refresh_token_encrypted, encryptionKey) });
    return client;
  }
  async function writeAudit(actor, action, request) {
    await repository.audit(actor.id, action, {}, request.ip);
  }
  return {
    async startAuthorization(request) {
      const state = randomBytes(32).toString("base64url");
      request.session.bloggerOAuthState = state;
      return newClient().generateAuthUrl({ access_type: "offline", prompt: "select_account consent", include_granted_scopes: true, scope: [BLOGGER_SCOPE], state });
    },
    async finishAuthorization(request) {
      const expected = String(request.session.bloggerOAuthState ?? "");
      delete request.session.bloggerOAuthState;
      const received = String(request.query.state ?? "");
      const matches = expected.length === received.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
      if (!matches || !request.query.code) { throw Object.assign(new Error("Blogger authorization could not be verified. Start the connection again."), { status: 400 }); }
      const client = newClient();
      const { tokens } = await client.getToken(String(request.query.code));
      let refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        const existing = await repository.connection();
        if (existing?.refresh_token_encrypted) { refreshToken = decryptRefreshToken(existing.refresh_token_encrypted, encryptionKey); }
      }
      if (!refreshToken) { throw Object.assign(new Error("Google did not provide offline Blogger access. Reconnect and approve the Blogger permission."), { status: 400 }); }
      client.setCredentials({ ...tokens, refresh_token: refreshToken });
      const availableBlogs = await blogs(client);
      if (!availableBlogs.length) { throw Object.assign(new Error("No Blogger blogs were found for this Google account. Choose the account that owns your blog, or create a blog at blogger.com, then reconnect."), { status: 400 }); }
      request.session.bloggerPendingToken = encryptRefreshToken(refreshToken, encryptionKey);
      request.session.bloggerPendingBlogs = availableBlogs;
      return availableBlogs;
    },
    async finishConnection(blogId, request) {
      const available = request.session.bloggerPendingBlogs ?? [];
      const selected = available.find((blog) => blog.id === String(blogId));
      if (!selected || !request.session.bloggerPendingToken) { throw Object.assign(new Error("Choose a Blogger blog from the verified list."), { status: 400 }); }
      const refreshToken = decryptRefreshToken(request.session.bloggerPendingToken, encryptionKey);
      const client = newClient();
      client.setCredentials({ refresh_token: refreshToken });
      const currentBlogs = await blogs(client);
      if (!currentBlogs.some((blog) => blog.id === selected.id)) { throw Object.assign(new Error("The selected Blogger blog is no longer available to this account."), { status: 403 }); }
      await repository.saveConnection(selected.id, request.session.bloggerPendingToken, request.user.id);
      await writeAudit(request.user, "blogger.connect", request);
      delete request.session.bloggerPendingToken;
      delete request.session.bloggerPendingBlogs;
      return selected;
    },
    async disconnect(request) {
      await repository.disconnect();
      await writeAudit(request.user, "blogger.disconnect", request);
    },
    async status() {
      const row = await repository.connection();
      const connected = Boolean(row?.blog_id && row.refresh_token_encrypted && !row.needs_reconnect);
      return { connected, needsReconnect: Boolean(row?.needs_reconnect), blogId: connected ? String(row.blog_id) : null, failedCount: await repository.failedPostCount?.() ?? 0 };
    },
    async retryFailed() {
      const ids = await repository.failedPostIds?.() ?? [];
      let attempted = 0;
      for (const id of ids) { await this.retryPost(id); attempted += 1; }
      return { attempted };
    },
    async syncPost(id) {
      const connection = await repository.connection();
      if (!connection?.blog_id || !connection.refresh_token_encrypted || connection.needs_reconnect) { return { status: "not_connected" }; }
      const post = await repository.postForSync(id);
      if (!post) { throw Object.assign(new Error("Post not found."), { status: 404 }); }
      const claim = await repository.claimPost(id);
      if (claim.pending) { return { status: "pending" }; }
      const marker = `<!-- elatedquest-post:${post.id} -->`;
      const ownUrl = `${siteUrl}/${encodeURIComponent(post.slug)}`;
      const content = `${sanitizePostHtml(post.content_html ?? "")}<p><em>Originally published at <a href="${ownUrl}">${ownUrl}</a></em></p>${marker}`;
      const resource = { title: post.title, content, labels: post.labels };
      try {
        const client = await clientForConnection(connection);
        let existingId = claim.bloggerPostId ?? post.blogger_post_id;
        if (!existingId) {
          const result = await client.request({ url: `${API}/blogs/${encodeURIComponent(connection.blog_id)}/posts/search`, params: { q: `elatedquest-post:${post.id}` } });
          existingId = (result.data.items ?? []).find((item) => String(item.content ?? "").includes(marker))?.id;
        }
        let result;
        if (existingId) {
          result = await client.request({ url: `${API}/blogs/${encodeURIComponent(connection.blog_id)}/posts/${encodeURIComponent(existingId)}`, method: "PUT", data: { ...resource, id: String(existingId) } });
        } else {
          result = await client.request({ url: `${API}/blogs/${encodeURIComponent(connection.blog_id)}/posts`, method: "POST", params: { isDraft: false }, data: resource });
        }
        if (!result.data?.id) { throw new Error("Blogger accepted the request without returning a post ID."); }
        await repository.completePost(id, result.data);
        return { status: "synced", url: result.data.url ?? null };
      } catch (error) {
        const message = safeError(error);
        await repository.failPost(id, message);
        if (Number(error.response?.status) === 401 || isInvalidGrant(error)) { await repository.needsReconnect(); }
        return { status: "failed", message };
      }
    },
    async retryPost(id) { return this.syncPost(id); },
    async revertPost(id) {
      const connection = await repository.connection();
      const post = await repository.postForSync(id);
      if (!connection?.blog_id || !post?.blogger_post_id || !connection.refresh_token_encrypted) { return { status: "not_connected" }; }
      try {
        const client = await clientForConnection(connection);
        await client.request({ url: `${API}/blogs/${encodeURIComponent(connection.blog_id)}/posts/${encodeURIComponent(post.blogger_post_id)}/revert`, method: "POST" });
        return { status: "reverted" };
      } catch (error) {
        if (Number(error.response?.status) === 401 || isInvalidGrant(error)) { await repository.needsReconnect(); }
        return { status: "failed", message: safeError(error) };
      }
    },
    async listBlogsForConnection() {
      const connection = await repository.connection();
      if (!connection?.refresh_token_encrypted) { return []; }
      try { return await blogs(await clientForConnection(connection)); }
      catch (error) { if (Number(error.response?.status) === 401) { await repository.needsReconnect(); } throw Object.assign(new Error(safeError(error)), { status: 502 }); }
    },
  };
}
