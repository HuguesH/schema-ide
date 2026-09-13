import { expect, test } from "@playwright/test";
import { encode } from "plantuml-encoder";

const svgFixture = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"60\"><text x=\"8\" y=\"35\">PlantUML</text></svg>";

test.beforeEach(async ({ page }) => {
  await page.route("https://cjrtnc.leaningtech.com/2.3/loader.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        globalThis.cheerpjInit = async () => {};
        globalThis.cheerpjRunMain = async () => {};
        globalThis.renderedSources = [];
        globalThis.cjCall = async (...args) => {
          globalThis.renderedSources.push(args[3]);
          return ${JSON.stringify(svgFixture)};
        };
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
  await expect(page.locator(".schema-item .schema-modified")).toContainText("Modifié");
  await expect(page.locator(".schema-item .schema-rendered")).toContainText("Rendu");
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

test("updates the last render time when forcing a fresh SVG render", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");

  const before = await page.evaluate(() => {
    const schemas = JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]");
    return {
      renderedAt: schemas[0]?.renderedAt,
      renderCount: globalThis.renderedSources?.length ?? 0,
    };
  });

  await page.waitForTimeout(20);
  await page.getByRole("button", { name: "Rendre le diagramme" }).click();
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");

  const after = await page.evaluate(() => {
    const schemas = JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]");
    return {
      renderedAt: schemas[0]?.renderedAt,
      renderCount: globalThis.renderedSources?.length ?? 0,
    };
  });
  expect(after.renderedAt).not.toBe(before.renderedAt);
  expect(after.renderCount).toBe(before.renderCount + 1);
});

test("stores SVGs in session storage and rerenders after clearing the session cache", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");

  const cacheState = await page.evaluate(() => {
    const schemas = JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]");
    const cache = JSON.parse(sessionStorage.getItem("schema-ide-svg-cache") ?? "{}");
    return { schema: schemas[0], cache };
  });
  expect(cacheState.schema).not.toHaveProperty("svg");
  expect(Object.keys(cacheState.cache)).toContain(cacheState.schema.hash);

  const renderCountBeforeClear = await page.evaluate(() => globalThis.renderedSources?.length ?? 0);
  await page.getByRole("button", { name: "Supprimer le cache SVG de la session" }).click();
  await expect(page.locator("#render-status")).toContainText("Cache SVG de session supprimé");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("schema-ide-svg-cache"))).toBeNull();

  await page.getByRole("button", { name: "Rendre le diagramme" }).click();
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");
  await expect.poll(() => page.evaluate(() => globalThis.renderedSources?.length ?? 0)).toBe(renderCountBeforeClear + 1);
});

test("updates the Workspace render time after editing the source", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");

  const before = await page.evaluate(() => {
    const schemas = JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]");
    return {
      modifiedAt: schemas[0]?.modifiedAt,
      renderedAt: schemas[0]?.renderedAt,
      renderCount: globalThis.renderedSources?.length ?? 0,
    };
  });

  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("@startuml\ntitle PlantUML Studio Base changed\nactor User\n@enduml");
  await expect.poll(() => page.evaluate(() => globalThis.renderedSources?.length ?? 0)).toBe(before.renderCount + 1);

  const after = await page.evaluate(() => {
    const schemas = JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]");
    return { modifiedAt: schemas[0]?.modifiedAt, renderedAt: schemas[0]?.renderedAt };
  });
  expect(after.modifiedAt).not.toBe(before.modifiedAt);
  expect(after.renderedAt).not.toBe(before.renderedAt);
  await expect(page.locator(".schema-item .schema-rendered")).toContainText("Rendu");
});

test("updates the preview when selecting another workspace diagram", async ({ page }) => {
  const firstSource = "@startuml\ntitle First\nAlice -> Bob: first\n@enduml";
  const secondSource = "@startuml\ntitle Second\nAlice -> Bob: second\n@enduml";
  await page.addInitScript(({ firstEncoded, secondEncoded }) => {
    localStorage.setItem("schema-ide-documents", JSON.stringify([
      { id: "first", name: "First", encoded: firstEncoded, savedAt: "2026-01-01T00:00:00.000Z", language: "plantuml" },
      { id: "second", name: "Second", encoded: secondEncoded, savedAt: "2026-01-02T00:00:00.000Z", language: "plantuml" },
    ]));
    localStorage.setItem("schema-ide-current", "first");
  }, { firstEncoded: encode(firstSource), secondEncoded: encode(secondSource) });

  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("Rendu terminé");
  const initialRenderCount = await page.evaluate(() => globalThis.renderedSources?.length ?? 0);

  await page.getByRole("button", { name: "Second" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.renderedSources?.length ?? 0)).toBeGreaterThan(initialRenderCount);
  await expect.poll(() => page.evaluate(() => globalThis.renderedSources?.at(-1))).toBe(secondSource);
  await expect(page.locator(".schema-item.active strong")).toHaveText("Second");

  const orderAfterSelection = await page.locator(".schema-item strong").allTextContents();
  expect(orderAfterSelection).toEqual(["First", "Second"]);
  expect(new URL(page.url()).hash).toMatch(/^#[0-9a-f]{16}$/);

  const renderCountBeforeCachedSelection = await page.evaluate(() => globalThis.renderedSources?.length ?? 0);
  const renderedAtBeforeCachedSelection = await page.evaluate(() => JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]")[0]?.renderedAt);
  await page.getByRole("button", { name: "First" }).click();
  await expect(page.locator(".schema-item.active strong")).toHaveText("First");
  await expect.poll(() => page.evaluate(() => globalThis.renderedSources?.length ?? 0)).toBe(renderCountBeforeCachedSelection);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]")[0]?.renderedAt)).toBe(renderedAtBeforeCachedSelection);

  const storedSchemas = await page.evaluate(() => JSON.parse(localStorage.getItem("schema-ide-documents") ?? "[]"));
  expect(storedSchemas).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "first",
      hash: expect.stringMatching(/^[0-9a-f]{16}$/),
      modifiedAt: expect.any(String),
      renderedAt: expect.any(String),
    }),
    expect.objectContaining({
      id: "second",
      hash: expect.stringMatching(/^[0-9a-f]{16}$/),
      modifiedAt: expect.any(String),
      renderedAt: expect.any(String),
    }),
  ]));
});
