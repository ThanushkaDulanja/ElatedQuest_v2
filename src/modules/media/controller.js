import { MEDIA_UPLOAD_LIMITS } from "../../config/constants.js";
import { parsePage, validateMediaDetails, validatePickerQuery } from "./validators.js";

export function createMediaController({ service, csrf }) {
  const noStore = (response) => response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  const wantsJson = (request) => request.xhr || String(request.get("accept") ?? "").split(",").some((type) => type.trim().split(";")[0] === "application/json");
  return {
    async page(request, response) {
      noStore(response);
      const { page } = parsePage(request.query.page, MEDIA_UPLOAD_LIMITS.listPageSize);
      const media = await service.list({ page });
      response.render("admin/media.njk", { user: request.user, activeNav: "media", media, page, csrfToken: csrf.generateCsrfToken(request, response), uploadError: null, success: request.query.saved === "1" ? "Image details saved." : request.query.uploaded === "1" ? "Image uploaded." : null });
    },
    async picker(request, response) {
      noStore(response);
      const { page } = parsePage(request.query.page, MEDIA_UPLOAD_LIMITS.pickerPageSize);
      response.json(await service.picker({ query: validatePickerQuery(request.query.query), page }));
    },
    async upload(request, response, next) {
      try {
        const media = await service.upload(request.file, request.user, request);
        if (wantsJson(request)) {return response.status(201).json(media);}
        return response.redirect("/aadmin/media?uploaded=1");
      } catch (error) { if (error.status) {return response.status(error.status).type("text/plain").send(error.message);} next(error); }
    },
    async update(request, response, next) {
      try {
        const media = await service.update(request.params.id, validateMediaDetails(request.body), request.user, request);
        if (wantsJson(request)) {return response.json(media);}
        return response.redirect("/aadmin/media?saved=1");
      } catch (error) { if (error.code) {return next(error);} if (error.status) {return response.status(error.status).type("text/plain").send(error.message);} response.status(400).type("text/plain").send(error.message); }
    },
    async delete(request, response, next) {
      try {
        await service.delete(request.params.id, request.user, request);
        if (wantsJson(request)) {return response.json({ deleted: true });}
        return response.redirect("/aadmin/media?deleted=1");
      } catch (error) {
        if (error.code) {return next(error);}
        if (wantsJson(request)) {return response.status(error.status || 400).json({ error: error.message, uses: error.uses ?? [] });}
        return response.status(error.status || 400).type("text/plain").send(error.message);
      }
    },
  };
}
