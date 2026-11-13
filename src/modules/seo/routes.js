export function registerRoutes(app, controller) {
  app.get("/sitemap.xml", controller.sitemap);
  app.get("/robots.txt", controller.robots);
  app.get("/feed.xml", controller.feed);
  app.use(controller.analyticsDomain);
}
