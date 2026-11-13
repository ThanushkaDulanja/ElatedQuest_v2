export function createAdsController(service) {
  return {
    async slot(request, response, next) {
      response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
      if (request.cookies?.["eq-consent"] !== "ads") { return response.status(403).json({ error: "Ad consent is required." }); }
      try {
        const config = await service.slot(request.params.slot);
        if (!config) { return response.status(404).json({ error: "Ad slot is unavailable." }); }
        return response.json(config);
      } catch (error) { return next(error); }
    },
    async adsTxt(_request, response, next) {
      try {
        const body = await service.adsTxt();
        if (!body) { return response.status(404).type("text/plain").end(); }
        return response.type("text/plain").send(body);
      } catch (error) { return next(error); }
    },
  };
}
