import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.ROUTINE_TEST_BASE_URL ?? "http://localhost:3111",
});

test("renders the clipboard shelf without changing the routine content", async ({
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
  await expect(page.locator("[data-routine-vignette]")).toBeVisible();
  await expect(page.locator("[data-routine-schedule-row]")).toHaveCount(11);

  const compactGeometry = await page.evaluate(() => {
    const hero = document.querySelector("[data-routine-hero]");
    const vignette = document.querySelector("[data-routine-vignette]");

    return {
      heroHeight: hero?.getBoundingClientRect().height ?? 0,
      vignetteWidth: vignette?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(compactGeometry.heroHeight).toBeLessThan(180);
  expect(compactGeometry.vignetteWidth).toBeLessThan(110);

  const content = page.locator("[data-routine-content]");
  await expect(content.getByText("3:45am", { exact: true })).toBeVisible();
  await expect(content.getByText("6:00am", { exact: true })).toBeVisible();
  await expect(content.getByText("9:15pm", { exact: true })).toBeVisible();

  const vignetteImages = page.locator("[data-routine-vignette] img");
  await expect(vignetteImages).toHaveCount(3);
  await expect
    .poll(() =>
      vignetteImages.evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);

  const imageGeometry = await vignetteImages.evaluateAll((images) =>
    images.map((image) => ({
      height: image.getBoundingClientRect().height,
      width: image.getBoundingClientRect().width,
    })),
  );
  expect(imageGeometry).toHaveLength(3);
  for (const image of imageGeometry) {
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
  }

  await context.close();
});

test("keeps the original mobile layout contained", async ({ browser }) => {
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

test("supports dark theme and suppresses new motion when requested", async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/routine");

  await expect(page.locator("html")).toHaveClass(/dark/);
  const vignette = page.locator("[data-routine-vignette]");
  await expect(vignette).toBeVisible();
  const animationCount = await vignette.evaluate(
    (element) => element.getAnimations({ subtree: true }).length,
  );
  expect(animationCount).toBe(0);

  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await context.close();
});
