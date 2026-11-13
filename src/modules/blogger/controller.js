export function createBloggerController(service, csrf) {
  const metadata = (response) => response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  const renderSelection = (request, response, error = null) => {
    metadata(response);
    response.status(error ? error.status || 400 : 200).render("admin/blogger-select.njk", { user: request.user, blogs: request.session.bloggerPendingBlogs ?? [], error, csrfToken: csrf.generateCsrfToken(request, response) });
  };
  return {
    async start(request, response, next) { try { response.redirect(await service.startAuthorization(request)); } catch (error) { next(error); } },
    async callback(request, response) {
      if (request.query.error) { return renderSelection(request, response, new Error("Blogger authorization was cancelled or denied.")); }
      try { const blogs = await service.finishAuthorization(request); if (!blogs.length) { throw new Error("No Blogger blogs were returned for this account."); } return renderSelection(request, response); }
      catch (error) { return renderSelection(request, response, error); }
    },
    async select(request, response) {
      try { await service.finishConnection(request.body.blog_id, request); response.redirect("/aadmin/settings?blogger_connected=1#blogger"); }
      catch (error) { renderSelection(request, response, error); }
    },
    async disconnect(request, response, next) { try { await service.disconnect(request); response.redirect("/aadmin/settings?blogger_disconnected=1#blogger"); } catch (error) { next(error); } },
    async retry(request, response, next) {
      try {
        const result = await service.retryPost(request.params.id);
        if (request.get("accept")?.includes("application/json")) { return response.status(result.status === "failed" ? 502 : 200).json(result); }
        if (result.status === "synced") { return response.redirect("/aadmin?blogger_synced=1"); }
        if (result.status === "failed") { return response.redirect("/aadmin?blogger_failed=1"); }
        if (result.status === "not_connected") { return response.redirect("/aadmin?blogger_disconnected=1"); }
        return response.redirect("/aadmin?blogger_pending=1");
      } catch (error) { next(error); }
    },
    async retryFailed(_request, response, next) {
      try { await service.retryFailed(); response.redirect("/aadmin?blogger_retried=1"); }
      catch (error) { next(error); }
    },
  };
}
