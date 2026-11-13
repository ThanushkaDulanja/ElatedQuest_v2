import { createAdsController } from "./controller.js";

export function registerAdsRoutes(app, service) {
  const controller = createAdsController(service);
  app.get("/api/ads/slots/:slot", controller.slot);
  app.get("/ads.txt", controller.adsTxt);
}
