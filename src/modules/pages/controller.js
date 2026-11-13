export function createPagesController(service, csrf) {
  return {
    async list(request, response) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      response.render("admin/pages.njk", { title: "Static pages", section: "pages", pages: await service.list(), user: request.user });
    },
    async edit(request, response, next) {
      try {
        const page = await service.get(request.params.slug);
        if (!page) { return response.sendStatus(404); }
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        return response.render("admin/page-edit.njk", { title: `Edit ${page.title}`, section: "pages", page, user: request.user, saved: request.query.saved === "1", csrfToken: csrf.generateCsrfToken(request, response) });
      } catch (error) { next(error); }
    },
    async save(request, response, next) {
      try {
        await service.update(request.params.slug, request.body, request.user.id, request.ip);
        return response.redirect(`/aadmin/pages/${encodeURIComponent(request.params.slug)}?saved=1`);
      } catch (error) {
        if (error.status === 404) { return response.sendStatus(404); }
        if (!error.code) { return response.status(400).send(error.message); }
        return next(error);
      }
    },
  };
}
