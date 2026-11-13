import { validateDraftInput, validateCategory } from "./validators.js";
import { toSqlDateTime } from "../../lib/time.js";
import { invalidate } from "../../lib/cache.js";

export function createPostsController({ service, repository, bloggerService, csrf, publicSiteService }) {
  const token = (req, res) => csrf.generateCsrfToken(req, res);
  const meta = (res) => res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  const wantsJson = (req) => req.get("accept")?.includes("application/json");
  const fail = (req, res, error, next) => { if (error.code) { return next(error); } const status = error.status || 400; if (wantsJson(req)) { return res.status(status).json({ error: error.message, missing: error.missing ?? [] }); } return res.status(status).send(error.message); };
  return {
    async dashboard(req, res) { meta(res); const data = await service.dashboard(req.query, req.user); res.render("admin/posts-dashboard.njk", { user: req.user, activeNav: "posts", csrfToken: token(req, res), query: req.query, ...data }); },
    async suggest(req, res) { meta(res); res.json(await service.suggest(req.query.q, req.user)); },
    async create(req, res) { const id = await service.create(req.user, req); res.redirect(`/aadmin/posts/${id}`); },
    async edit(req, res, next) { meta(res); try { const { post, readOnly, revisions } = await service.editorView(req.params.id, req.user); post.tag_names = post.tags.map((tag) => tag.name).join(", "); post.updated_at_input = toSqlDateTime(post.updated_at); const [categories, authors, settings, blogger] = await Promise.all([repository.categories(), req.user.role === "owner" ? repository.authors() : [], service.dashboard({}, req.user), bloggerService?.status?.() ?? { connected: false }]); res.render("admin/post-edit.njk", { user: req.user, activeNav: "posts", post, readOnly, revisions, categories, authors, blogger, csrfToken: token(req, res), editorsCanPublish: settings.editorsCanPublish, timeZone: settings.timeZone }); } catch (error) { if (error.status) {return res.status(error.status).send(error.message);} next(error); } },
    async save(req, res, next) { try { const fields = validateDraftInput(req.body); fields.author_id = req.body.author_id; fields.is_featured = req.body.is_featured; fields.is_editor_pick = req.body.is_editor_pick; const post = await service.save(req.params.id, fields, req.user, req, req.body.expected_updated_at, req.body.autosave === "1"); if (wantsJson(req)) { return res.json({ ok: true, updated_at: toSqlDateTime(post.updated_at), title: post.title, content_html: post.content_html }); } res.redirect(`/aadmin/posts/${req.params.id}?saved=1`); } catch (error) { return fail(req, res, error, next); } },
    async action(req, res, next) { try { const result = await service.action(req.params.id, req.params.action, req.body.note, req.user, req, req.body.expected_updated_at, req.body.scheduled_at); if (wantsJson(req)) { return res.json({ ok: true, ...result }); } if (req.params.action === "publish") { return res.redirect(`/aadmin?published=1${result.blogger?.status === "failed" ? "&blogger_failed=1" : ""}`); } if (req.params.action === "schedule") { return res.redirect("/aadmin?scheduled=1"); } if (req.params.action === "reject") { return res.redirect("/aadmin?changes_requested=1"); } res.redirect(`/aadmin/posts/${req.params.id}`); } catch (error) { return fail(req, res, error, next); } },
    async restore(req, res, next) { try { const post = await service.restore(req.params.id, req.params.revisionId, req.user, req, req.body.expected_updated_at); if (wantsJson(req)) { return res.json({ ok: true, updated_at: toSqlDateTime(post.updated_at), title: post.title, content_html: post.content_html }); } res.redirect(`/aadmin/posts/${req.params.id}?restored=1`); } catch (error) { return fail(req, res, error, next); } },
    async preview(req, res, next) {
      meta(res);
      res.set("Cache-Control", "no-store");
      try {
        const permittedPost = await service.preview(req.params.id, req.user);
        const publicData = await publicSiteService.previewData(permittedPost.id);
        if (!publicData) { return res.status(404).send("Post not found."); }
        const post = publicData.post;
        const content = await service.publicContent(post.id, permittedPost.preview_content_html);
        const author = { ...post, display_name: post.author_name, slug: post.author_slug, avatar_url: post.author_avatar_url, initials: String(post.author_name ?? "?").split(/\s+/u).map((part) => part[0]).join("").slice(0, 2).toUpperCase() };
        const site = await publicSiteService.siteData();
        res.render("public/post.njk", { ...publicData, site, post, author, content, coverCreditUrl: publicSiteService.safeUrl(post.cover_credit_url), title: post.seo_title || `${post.title} – ${site.general.siteName}`, description: post.seo_description || post.excerpt || "", canonical: null, robots: "noindex,nofollow", previewMode: true, currentYear: new Date().getUTCFullYear() });
      } catch (error) { if (error.status) { return res.status(error.status).send(error.message); } next(error); }
    },
    async delete(req, res, next) { try { await service.action(req.params.id, "delete", "", req.user, req, req.body.expected_updated_at); res.redirect("/aadmin?deleted=1"); } catch (error) { if (error.code) {return next(error);} res.status(error.status || 400).send(error.message); } },
    async categories(req, res) { meta(res); const rows = await repository.listCategories(); res.render("admin/categories.njk", { user: req.user, activeNav: "categories", rows, csrfToken: token(req, res) }); },
    async addCategory(req, res) {
      try { const data = validateCategory(req.body); if (await repository.categorySlugInUse(data.slug)) {return res.status(409).send("That category slug is already in use.");} const id = await repository.addCategory(data); invalidate("site:"); await repository.auditCategory(req.user.id, "category.create", id, req.ip); res.redirect("/aadmin/categories"); }
      catch (error) { if (error.code === "ER_DUP_ENTRY") {return res.status(409).send("That category slug is already in use.");} throw error; }
    },
    async updateCategory(req, res) {
      try { const data = validateCategory(req.body); if (await repository.categorySlugInUse(data.slug, req.params.id)) {return res.status(409).send("That category slug is already in use.");} await repository.updateCategory(req.params.id, data); invalidate("site:"); await repository.auditCategory(req.user.id, "category.update", req.params.id, req.ip); res.redirect("/aadmin/categories"); }
      catch (error) { if (error.code === "ER_DUP_ENTRY") {return res.status(409).send("That category slug is already in use.");} throw error; }
    },
    async deleteCategory(req, res) { const deleted = await repository.deleteCategory(req.params.id); if (!deleted) {return res.status(409).send("This category cannot be deleted because a post uses it.");} invalidate("site:"); await repository.auditCategory(req.user.id, "category.delete", req.params.id, req.ip); res.redirect("/aadmin/categories"); },
  };
}
