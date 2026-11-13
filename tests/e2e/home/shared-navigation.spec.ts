import { expect, test } from "../../../src/fixtures/base.ts";
import { HomePage } from "../../../src/pages/home-page.ts";

test.describe("Home page and shared navigation", () => {
  test("Scenario 1.1: homepage navigation works @smoke @regression", async ({ page }) => {
    const home = new HomePage(page);

    await test.step("Open the homepage and verify its main content", async () => {
      await home.goto();

      await expect(page).toHaveTitle(/Elated Quest/);
      await expect(home.main).toBeVisible();
      await expect(home.skipToContentLink).toBeAttached();
    });

    await test.step("Check active navigation, search, footer, and social destinations", async () => {
      await expect(home.siteNavigation).toBeVisible();
      await expect(home.searchLink).toHaveAttribute("href", "/search");
      await expect(page.getByRole("navigation", { name: "Latest article categories" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Latest article categories" }).getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");

      for (const navigation of [
        home.siteNavigation,
        home.footerNavigation,
        home.socialNavigation,
      ]) {
        const destinations = await home.getLinkDestinations(
          navigation.getByRole("link"),
        );

        for (const destination of destinations) {
          expect(destination).toBeTruthy();
          expect(destination).not.toMatch(/^javascript:/i);
        }
      }
    });

    await test.step("Open a category from the mobile menu and return home", async () => {
      const categoryName = await home.getFirstCategoryName();
      await home.setMobileViewport();
      await home.openMobileMenu();
      await home.openCategory(categoryName);

      await expect(page.getByRole("heading", { name: categoryName })).toBeVisible();

      await home.brandLink.click();
      await expect(home.main).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });

    await test.step("Verify keyboard focus reaches the skip link", async () => {
      await page.keyboard.press("Tab");
      await expect(home.skipToContentLink).toBeFocused();
    });
  });
});
