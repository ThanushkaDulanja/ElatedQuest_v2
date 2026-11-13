import type { Locator, Page } from "@playwright/test";
import { BasePage } from "./base-page.ts";

export class HomePage extends BasePage {
  readonly main: Locator;
  readonly siteNavigation: Locator;
  readonly categoryNavigation: Locator;
  readonly searchLink: Locator;
  readonly footerNavigation: Locator;
  readonly socialNavigation: Locator;
  readonly mobileMenuButton: Locator;
  readonly mobileNavigation: Locator;

  constructor(page: Page) {
    super(page);
    this.main = page.getByRole("main");
    this.siteNavigation = page.getByRole("navigation", { name: "Site links" });
    this.categoryNavigation = page.getByRole("navigation", {
      name: "People also read categories",
    });
    this.searchLink = page.getByRole("link", { name: "Search stories" });
    this.footerNavigation = page.getByRole("navigation", { name: "Footer links" });
    this.socialNavigation = page.getByRole("navigation", { name: "Follow us" });
    this.mobileMenuButton = page.getByLabel("Open menu");
    this.mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  async getFirstCategoryName(): Promise<string> {
    return this.categoryNavigation.getByRole("link").nth(1).innerText();
  }

  async openCategory(name: string): Promise<void> {
    await this.mobileNavigation.getByRole("link", { name, exact: true }).click();
  }

  async setMobileViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 375, height: 800 });
  }

  async openMobileMenu(): Promise<void> {
    await this.mobileMenuButton.click();
  }
}
