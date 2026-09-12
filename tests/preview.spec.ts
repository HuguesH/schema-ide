import { expect, test } from "@playwright/test";

const svgFixture = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"60\"><text x=\"8\" y=\"35\">PlantUML</text></svg>";

test.beforeEach(async ({ page }) => {
  await page.route("https://cjrtnc.leaningtech.com/2.3/loader.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        globalThis.cheerpjInit = async () => {};
        globalThis.cheerpjRunMain = async () => {};
        globalThis.cjCall = async () => ${JSON.stringify(svgFixture)};
      `,
    });
  });

  await page.route("**/node_modules/@sakirtemel/plantuml.js/plantuml.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "const plantuml = { initialize: async () => {} };",
    });
  });
});

test("renders the default diagram as SVG and exposes only SVG downloads", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#runtime-status")).toContainText("Prêt");
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");
  await expect(page.locator("#diagram-image")).toHaveClass(/visible/);
  await expect(page.locator("#diagram-image")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("#source-preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SOURCE" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export SVG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "↓ Télécharger SVG" })).toBeVisible();
});

test("downloads the rendered diagram as SVG", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Télécharger SVG" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("diagram.svg");
});
