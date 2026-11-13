import { validateInviteEmail } from "./validators.js";

export function createTeamController(service, csrf) {
  return {
    async page(request, response) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      response.render("admin/m2.njk", { title: "Team", section: "team", rows: await service.list(), csrfToken: csrf.generateCsrfToken(request, response), ownerEmail: process.env.OWNER_EMAIL, user: request.user });
    },
    async invite(request, response, next) {
      try { await service.invite(validateInviteEmail(request.body.email ?? ""), request.user, request); response.redirect("/aadmin/team"); }
      catch (error) { if (error.code) { next(error); return; } response.status(400).render("admin/m2.njk", { title: "Team", section: "team", rows: await service.list(), error: error.message, csrfToken: csrf.generateCsrfToken(request, response), ownerEmail: process.env.OWNER_EMAIL, user: request.user }); }
    },
    async action(request, response, next) {
      try {
        if (request.params.action === "disable" || request.params.action === "enable") {await service.changeStatus(request.params.id, request.params.action === "disable" ? "disabled" : "active", request.user, request);}
        else if (request.params.action === "resend") {await service.resend(request.params.id, request.user);}
        else if (request.params.action === "remove") {await service.remove(request.params.id, request.user, request.user.id, request);}
        else {return response.sendStatus(404);}
        response.redirect("/aadmin/team");
      } catch (error) { if (error.code) { next(error); return; } response.status(400).send(error.message); }
    },
  };
}
