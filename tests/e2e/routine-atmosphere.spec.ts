import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.ROUTINE_TEST_BASE_URL ?? "http://localhost:3111",
});

test("renders the sky-band hero without changing the routine content", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto("/routine");

  await expect(
    page.getByRole("heading", { name: "Chappy's Core Daily Routine" }),
  ).toBeVisible();

  // The hero is the daylight sky band with the skyline silhouette.
  const hero = page.locator("[data-daylight-hero]");
  await expect(hero).toBeVisible();
  await expect(hero.locator(".dl-skyline svg")).toHaveCount(1);

  const content = page.locator("[data-routine-content]");
  await expect(content.getByText("3:45am", { exact: true })).toBeVisible();
  await expect(content.getByText("6:00am", { exact: true })).toBeVisible();
  await expect(content.getByText("9:15pm", { exact: true })).toBeVisible();

  // The desktop TOC is an in-flow column, so it must never extend past the
  // viewport's left edge (the old zero-width overlay clipped at 1024-1150px).
  const tocBox = await page
    .locator("nav[aria-label='Sections']")
    .first()
    .boundingBox();
  expect(tocBox).not.toBeNull();
  expect(tocBox!.x).toBeGreaterThanOrEqual(0);

  await context.close();
});

test("keeps the desktop TOC on-screen at the 1100px squeeze", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/routine");

  const toc = page.locator("nav[aria-label='Sections']").first();
  await expect(toc).toBeVisible();
  const tocBox = await toc.boundingBox();
  expect(tocBox).not.toBeNull();
  expect(tocBox!.x).toBeGreaterThanOrEqual(0);

  const geometry = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
    geometry.documentClientWidth,
  );

  await context.close();
});

test("keeps the mobile layout contained", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/routine");

  const geometry = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
    geometry.documentClientWidth,
  );

  const toc = page.locator("[data-routine-mobile-toc]");
  await expect(toc).toBeVisible();

  await context.close();
});

test("preserves section navigation, keyboard expansion, and deep links", async ({
  page,
}) => {
  await page.goto("/routine");

  const whyEarly = page.getByRole("button", { name: /Why So Early/ }).last();
  await whyEarly.focus();
  await whyEarly.press("Enter");
  await expect(whyEarly).toHaveAttribute("aria-expanded", "true");

  await page.goto("/routine#caffeine");
  const caffeine = page.getByRole("button", { name: /Caffeine/ }).last();
  await expect(caffeine).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#caffeine");
});

test("supports dark theme", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/routine");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("[data-daylight-hero]")).toBeVisible();

  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await context.close();
});
