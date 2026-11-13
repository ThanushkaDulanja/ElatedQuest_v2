import type { Locator, Page } from "@playwright/test";

export class BasePage {
  readonly page: Page;
  readonly brandLink: Locator;
  readonly skipToContentLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.brandLink = page.getByRole("link", { name: /Elated Quest/ }).first();
    this.skipToContentLink = page.getByRole("link", { name: "Skip to content" });
  }

  async getLinkDestinations(links: Locator): Promise<Array<string | null>> {
    const linkLocators = await links.all();
    const destinations: Array<string | null> = [];

    for (const link of linkLocators) {
      destinations.push(await link.getAttribute("href"));
    }

    return destinations;
  }
}
