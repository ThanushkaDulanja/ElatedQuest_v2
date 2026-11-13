import { APP_LIMITS, ADMIN_LIST_PAGE_SIZE } from "../../config/constants.js";
import { sanitizePostHtml, htmlToPlainText } from "../../lib/sanitize.js";
import { localDateTimeToUtc } from "../../lib/time.js";
import { buildUniqueSlug, validatePostSlug, slugify } from "../../lib/slug.js";
import { formatDateTimeInZone, toSqlDateTime } from "../../lib/time.js";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function decorateInlineCredits(html, media) {
  const credits = new Map(media.map((item) => [item.file_name, item]));
  const protectedImages = [];
  const protect = (image) => {
    protectedImages.push(image);
    return `\u0000INLINE_IMAGE_${protectedImages.length - 1}\u0000`;
  };
  const captionFor = (image) => {
    const source = /\bsrc\s*=\s*(["'])(.*?)\1/iu.exec(image)?.[2];
    if (!source) {return "";}
    let fileName;
    try {fileName = decodeURIComponent(new URL(source, "https://local.invalid").pathname.split("/").at(-1));} catch {return "";}
    const item = credits.get(fileName);
    if (!item?.credit_text) {return "";}
    const credit = escapeHtml(item.credit_text);
    const link = item.credit_url ? ` · <a href="${escapeHtml(item.credit_url)}" rel="noopener noreferrer">Source</a>` : "";
    return `<figcaption>${credit}${link}</figcaption>`;
  };
  let result = String(html ?? "").replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/giu, (figure) => {
    const alreadyHasCaption = /<figcaption\b/iu.test(figure);
    return figure.replace(/<img\b[^>]*>/giu, (image) => `${protect(image)}${alreadyHasCaption ? "" : captionFor(image)}`);
  });
  result = result.replace(/<p\b[^>]*>\s*(<img\b[^>]*>)\s*<\/p>/giu, (paragraph, image) => {
    const caption = captionFor(image);
    return caption ? `<figure>${protect(image)}${caption}</figure>` : paragraph;
  });
  result = result.replace(/<img\b[^>]*>/giu, (image) => {
    const caption = captionFor(image);
    return caption ? `<figure>${protect(image)}${caption}</figure>` : image;
  });
  return result.replace(/\u0000INLINE_IMAGE_(\d+)\u0000/gu, (_marker, index) => protectedImages[Number(index)]);
}

export function createPostsService({ repository, settingsService, bloggerService, emailer, ownerEmail }) {
  async function allowedToEdit(post, user) {
    if (user.role === "owner") {return post.status !== "archived";}
    if (Number(post.created_by) !== Number(user.id)) {return false;}
    if (post.status === "draft") {return true;}
    if (post.status === "published") {return Boolean((await settingsService.get()).editors_can_publish?.value);}
    return false;
  }
  async function audit(action, id, user, request) {
    await repository.writeAudit({ actorId: user.id, action: `post.${action}`, entityType: "post", entityId: String(id), ip: request.ip });
  }
  return {
    async publicContent(postId, html) {
      const credits = await repository.inlineMediaCredits(postId);
      return sanitizePostHtml(decorateInlineCredits(html, credits));
    },
    async create(user, request) {
      const authorId = await repository.ensureAuthor(user);
      const id = await repository.createDraft(user, authorId);
      await audit("create", id, user, request);
      return id;
    },
    async get(id, user) { const post = await repository.getPost(id); if (!post || !await allowedToEdit(post, user)) {throw Object.assign(new Error("Post not found."), { status: 404 });} return post; },
    async editorView(id, user) {
      const post = await repository.getPost(id);
      if (!post || (user.role !== "owner" && Number(post.created_by) !== Number(user.id))) { throw Object.assign(new Error("Post not found."), { status: 404 }); }
      const editable = await allowedToEdit(post, user);
      if (!editable && user.role === "owner") { throw Object.assign(new Error("Post not found."), { status: 404 }); }
      return { post, readOnly: !editable, revisions: await repository.revisions(id) };
    },
    async preview(id, user) {
      const post = await repository.getPost(id);
      if (!post || (user.role !== "owner" && Number(post.created_by) !== Number(user.id))) { throw Object.assign(new Error("Post not found."), { status: 404 }); }
      const credits = await repository.inlineMediaCredits(id);
      return { ...post, preview_content_html: decorateInlineCredits(post.content_html, credits) };
    },
    async save(id, input, user, request, expectedUpdatedAt, autosave = false) {
      const post = await repository.getPost(id);
      if (!post) {throw Object.assign(new Error("Post not found."), { status: 404 });}
      if (!await allowedToEdit(post, user)) {throw Object.assign(new Error("You cannot edit this post."), { status: 403 });}
      if (autosave && post.status === "published") { throw Object.assign(new Error("Autosave is unavailable for published posts."), { status: 409 }); }
      if (!expectedUpdatedAt) {throw Object.assign(new Error("Reload the post before saving."), { status: 409 });}
      const fields = input;
      fields.slug = fields.slug || await buildUniqueSlug(fields.title, repository, id);
      if (post.published_at && fields.slug !== post.slug && user.role !== "owner") {throw Object.assign(new Error("Only an Admin can change a published slug."), { status: 403 });}
      if (post.published_at && fields.slug !== post.slug && input.confirm_slug_change !== "1") {throw Object.assign(new Error("Confirm the published slug change before saving."), { status: 409 });}
      await validatePostSlug(fields.slug, repository, id);
      const html = sanitizePostHtml(fields.content_html);
      const plain = htmlToPlainText(html);
      const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/iu.exec(html)?.[1] ?? plain;
      const excerpt = (fields.excerpt || htmlToPlainText(paragraph)).slice(0, APP_LIMITS.excerpt);
      const words = plain ? plain.split(/\s+/u).length : 0;
      const authorId = user.role === "owner" && fields.author_id ? Number(fields.author_id) : post.author_id;
      const updated = { ...fields, excerpt, content_html: html, content_text: plain, reading_minutes: Math.max(1, Math.ceil(words / 200)), author_id: authorId, is_featured: user.role === "owner" && input.is_featured ? 1 : 0, is_editor_pick: user.role === "owner" && input.is_editor_pick ? 1 : 0 };
      const tags = fields.tags.map((name) => ({ name: name.slice(0, APP_LIMITS.tagName), slug: slugify(name).slice(0, 80) })).filter((tag) => tag.slug);
      const result = await repository.savePost(id, updated, expectedUpdatedAt, user.id, tags, fields.slug !== post.slug, request.ip, autosave ? "throttled" : true);
      if (result.conflict) {
        const who = await repository.conflictActor(id);
        const when = who?.created_at ? formatDateTimeInZone(who.created_at, "UTC") : "recently";
        throw Object.assign(new Error(`This post was changed by ${who?.name || "someone else"} at ${when}. Reload to see their changes.`), { status: 409 });
      }
      if (post.status === "published") { const { invalidate } = await import("../../lib/cache.js"); invalidate(`post:${post.slug}`); if (fields.slug !== post.slug) { invalidate(`post:${fields.slug}`); } invalidate("home"); }
      return repository.getPost(id);
    },
    async restore(id, revisionId, user, request, expectedUpdatedAt) {
      const post = await repository.getPost(id);
      if (!post || !await allowedToEdit(post, user)) { throw Object.assign(new Error("You cannot restore this post."), { status: 403 }); }
      const revision = await repository.getRevision(id, revisionId);
      if (!revision) { throw Object.assign(new Error("Revision not found."), { status: 404 }); }
      const html = sanitizePostHtml(revision.content_html);
      const plain = htmlToPlainText(html);
      const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/iu.exec(html)?.[1] ?? plain;
      const restored = { title: revision.title, content_html: html, content_text: plain, excerpt: htmlToPlainText(paragraph).slice(0, APP_LIMITS.excerpt), reading_minutes: Math.max(1, Math.ceil((plain ? plain.split(/\s+/u).length : 0) / 200)) };
      const result = await repository.restoreRevision(id, revisionId, user.id, expectedUpdatedAt, restored, request.ip);
      if (result.conflict) {
        const who = await repository.conflictActor(id);
        const when = who?.created_at ? formatDateTimeInZone(who.created_at, "UTC") : "recently";
        throw Object.assign(new Error(`This post was changed by ${who?.name || "someone else"} at ${when}. Reload to see their changes.`), { status: 409 });
      }
      if (post.status === "published") { const { invalidate } = await import("../../lib/cache.js"); invalidate(`post:${post.slug}`); invalidate("home"); }
      return repository.getPost(id);
    },
    async action(id, action, note, user, request, expectedUpdatedAt, scheduledAtLocal = "", now = new Date()) {
      const post = await repository.getPost(id);
      if (!post) {throw Object.assign(new Error("Post not found."), { status: 404 });}
      let scheduledAt = null;
      const own = Number(post.created_by) === Number(user.id);
      const settings = await settingsService.get();
      let status;
      if (action === "submit") {
        if (!own || post.status !== "draft") {throw Object.assign(new Error("Only your own draft can be submitted."), { status: 409 });}
        status = "in_review";
      } else if (action === "publish" || action === "schedule") {
        if (!(user.role === "owner" || (user.role === "editor" && own && settings.editors_can_publish?.value))) {throw Object.assign(new Error("You are not allowed to publish posts."), { status: 403 });}
        if (action === "schedule" && post.status !== "draft") {throw Object.assign(new Error("Only a draft can be scheduled."), { status: 409 });}
        if (action === "publish" && !["draft", "in_review", "scheduled"].includes(post.status) && !(user.role === "owner" && post.status === "published")) {throw Object.assign(new Error("This post cannot be published from its current status."), { status: 409 });}
        const missing = await repository.validatePublish(id);
        if (missing.length) {throw Object.assign(new Error(`Complete these items before publishing: ${missing.join(", ")}.`), { status: 409, missing });}
        status = action === "schedule" ? "scheduled" : "published";
        if (action === "schedule") {
          const timeZone = settings.general?.timezone || "UTC";
          scheduledAt = localDateTimeToUtc(scheduledAtLocal, timeZone);
          if (scheduledAt.getTime() <= now.getTime()) {throw new Error("Choose a time in the future.");}
        }
      } else if (action === "reject") {
        if (user.role !== "owner") {throw Object.assign(new Error("Only an Admin can request changes."), { status: 403 });}
        if (post.status !== "in_review") {throw Object.assign(new Error("Only an in-review post can be returned for changes."), { status: 409 });}
        if (String(note ?? "").length > APP_LIMITS.reviewNote) {throw new Error("Review note must be at most 500 characters.");}
        status = "draft";
      } else if (action === "archive") {
        if (user.role !== "owner") {throw Object.assign(new Error("Only an Admin can archive posts."), { status: 403 });}
        if (post.status !== "published") {throw Object.assign(new Error("Only published posts can be archived."), { status: 409 });}
        status = "archived";
      } else if (action === "delete") {
        if (post.status !== "draft" || (user.role !== "owner" && !own)) {throw Object.assign(new Error("Only a draft you own can be deleted."), { status: 403 });}
        status = "draft";
      } else {throw Object.assign(new Error("Unsupported post action."), { status: 403 });}
      const lifecycle = await repository.setLifecycle(id, status, user.id, action, note ?? null, action === "delete", expectedUpdatedAt, scheduledAt);
      if (lifecycle.conflict) {throw Object.assign(new Error("This post has changed. Reload to see the latest changes."), { status: 409 });}
      if (["publish", "archive"].includes(action)) { const { invalidate } = await import("../../lib/cache.js"); invalidate(`post:${post.slug}`); invalidate("home"); }
      if (action === "submit") { try { await emailer.sendPostSubmittedNotice(ownerEmail, post.title); } catch { /* Email delivery must not block submission. */ } }
      let blogger = null;
      if (action === "publish" && settings.blogger_auto_sync?.value !== false && bloggerService) {
        try { blogger = await bloggerService.syncPost(id); }
        catch { blogger = { status: "failed", message: "The post was published, but Blogger synchronization could not start." }; }
      }
      if (action === "archive" && bloggerService) {
        try { blogger = await bloggerService.revertPost(id); }
        catch { blogger = { status: "failed", message: "The post was archived locally, but Blogger could not revert its copy." }; }
      }
      return { status, blogger };
    },
    async dashboard(query, user) {
      const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
      const status = ["draft", "in_review", "scheduled", "published", "archived"].includes(query.status) ? query.status : "";
      const search = String(query.search ?? "").trim().slice(0, 120);
      const requestedPostId = Number(query.post_id);
      const postId = Number.isSafeInteger(requestedPostId) && requestedPostId > 0 ? requestedPostId : null;
      const data = await repository.dashboard({ userId: user.id, role: user.role, status, search, postId, offset: (page - 1) * ADMIN_LIST_PAGE_SIZE, limit: ADMIN_LIST_PAGE_SIZE });
      data.rows = data.rows.map((row) => ({ ...row, updated_at_input: toSqlDateTime(row.updated_at) }));
      const settings = await settingsService.get();
      return { ...data, page, status, search, postId, pageSize: ADMIN_LIST_PAGE_SIZE, categories: await repository.categories(), editorsCanPublish: Boolean(settings.editors_can_publish?.value), timeZone: settings.general?.timezone || "UTC", blogger: await bloggerService?.status?.() ?? { connected: false, needsReconnect: false } };
    },
    async suggest(query, user) {
      const search = String(query ?? "").trim().slice(0, 120);
      if (search.length < 2) {return [];}
      return repository.suggest({ query: search, userId: user.id, role: user.role, limit: 8 });
    },
  };
}

export function createTagService(repository) {
  return { async findOrCreate(name) { const trimmed = String(name ?? "").trim(); if (!trimmed) {throw new Error("Tag name is required.");} if (Array.from(trimmed).length > APP_LIMITS.tagName) {throw new Error(`Tag name must be at most ${APP_LIMITS.tagName} characters.`);} const slug = slugify(trimmed).slice(0, 80); if (!slug) {throw new Error("Tag name must include letters or numbers.");} return repository.findOrCreateTag(trimmed, slug); } };
}
