import { validateAuthor } from "./validators.js";

export function createAuthorsController(service, csrf, mediaService = { async picker() { return []; } }) {
  return {
    async profile(request, response) { response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }); const [author, media] = await Promise.all([service.forUser(request.user.id), mediaService.list({ limit: 100 })]); response.render("admin/m2.njk", { title: "My profile", section: "profile", author, media, csrfToken: csrf.generateCsrfToken(request, response), user: request.user }); },
    async saveProfile(request, response, next) { try { await service.saveProfile(request.user, validateAuthor(request.body), request); response.redirect("/aadmin/profile"); } catch (error) { if (error.code) { next(error); return; } response.status(400).send(error.message); } },
    async authors(request, response) { response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }); const [authors, media] = await Promise.all([service.list(), mediaService.list({ limit: 100 })]); response.render("admin/m2.njk", { title: "Authors", section: "authors", authors, media, csrfToken: csrf.generateCsrfToken(request, response), user: request.user }); },
    async save(request, response, next) { try { const values = validateAuthor(request.body); await service.saveProfile(request.user, values, request, request.params.id ? Number(request.params.id) : null); response.redirect("/aadmin/team/authors"); } catch (error) { if (error.code) { next(error); return; } response.status(400).send(error.message); } },
    async guest(request, response, next) { try { await service.saveGuest(validateAuthor(request.body), request, request.params.id ? Number(request.params.id) : null, request.user); response.redirect("/aadmin/team/authors"); } catch (error) { if (error.code) { next(error); return; } response.status(400).send(error.message); } },
  };
}
