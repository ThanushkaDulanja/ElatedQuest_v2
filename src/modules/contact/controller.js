export function createContactController({ service, siteService, csrf }) {
  async function renderContact(request, response, { error = null, status = 200, formValues = {}, resetStartedAt = true } = {}) {
    if (resetStartedAt) { request.session.contactFormStartedAt = Date.now(); }
    const [site, page] = await Promise.all([siteService.siteData(), siteService.staticPage("contact-us")]);
    response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    return response.status(status).render("public/contact.njk", { site, page, type: request.query.type === "story" ? "story" : "message", error, formValues, title: `Contact us – ${site.general.siteName}`, description: "Contact the Elated Quest team or send a story.", canonical: null, robots: "noindex,follow", csrfToken: csrf.generateCsrfToken(request, response), currentYear: new Date().getUTCFullYear() });
  }

  return {
    async contactPage(request, response, next) { try { return await renderContact(request, response); } catch (error) { next(error); } },
    async submit(request, response, next) {
      try {
        await service.submit(request.body, { ip: request.ip, userAgent: request.get("user-agent") ?? "", startedAt: request.session.contactFormStartedAt });
        delete request.session.contactFormStartedAt;
        return response.redirect(303, "/thank-you");
      } catch (error) {
        if (error.status) { request.query.type = request.body.type; return renderContact(request, response, { error: error.message, status: error.status, formValues: request.body, resetStartedAt: false }); }
        return next(error);
      }
    },
    async storiesInbox(request, response, next) {
      if (request.query.tab !== "stories") { return next("route"); }
      try {
        const [site, stories] = await Promise.all([siteService.siteData(), service.stories()]);
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        return response.render("admin/inbox-ugc.njk", { title: "Inbox · Stories", section: "comments", tab: "stories", site, stories, csrfToken: csrf.generateCsrfToken(request, response), user: request.user });
      } catch (error) { next(error); }
    },
    async messagesInbox(request, response, next) {
      if (request.query.tab !== "messages") { return next("route"); }
      try {
        const [site, messages] = await Promise.all([siteService.siteData(), service.messages()]);
        response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        return response.render("admin/inbox-ugc.njk", { title: "Inbox · Messages", section: "comments", tab: "messages", site, messages, csrfToken: csrf.generateCsrfToken(request, response), user: request.user });
      } catch (error) { next(error); }
    },
    async storyStatus(request, response, next) {
      try { if (!["reject", "spam"].includes(request.params.action)) { return response.sendStatus(404); } const status = request.params.action === "spam" ? "spam" : "rejected"; await service.setStoryStatus(request.params.id, status, request.user.id, request.ip); return response.redirect("/aadmin/inbox?tab=stories"); }
      catch (error) { next(error); }
    },
    async convertStory(request, response, next) {
      try { const result = await service.convertStory(request.params.id, request.user.id, request.ip); if (!result) { return response.status(404).send("Story not found or already handled."); } return response.redirect(`/aadmin/posts/${result.postId}`); }
      catch (error) { next(error); }
    },
    async messageStatus(request, response, next) {
      try { const status = ["read", "replied", "spam"].includes(request.params.action) ? request.params.action : null; if (!status) { return response.sendStatus(404); } await service.setMessageStatus(request.params.id, status, request.user.id, request.ip); return response.redirect("/aadmin/inbox?tab=messages"); }
      catch (error) { next(error); }
    },
  };
}
