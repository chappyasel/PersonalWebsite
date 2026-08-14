import { expect, test } from "@playwright/test";

type PerfWindow = typeof window & {
  __coldLoadMetrics?: { lcp: number; cls: number };
};

async function installWebVitalsObserver(
  page: import("@playwright/test").Page,
) {
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0 };
    (window as PerfWindow).__coldLoadMetrics = metrics;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test("preloads only the critical Georgia faces", async ({ page }) => {
  await page.goto("/");
  const fontPreloads = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLLinkElement).href).pathname),
    );

  expect([...new Set(fontPreloads)]).toEqual([
    "/fonts/v1/GeorgiaPro-Regular.woff2",
    "/fonts/v1/GeorgiaPro-SemiBold.woff2",
  ]);
});

test("advertises the public homepage OG image", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /^https:\/\/www\.chappyasel\.com\/opengraph-image/,
  );

  const image = await request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("applies a stored font before the app hydrates", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("font-preference", "system");
  });
  await page.goto("/books", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("data-font", "system");
  const bodyFont = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).fontFamily);
  expect(bodyFont).toContain("ui-sans-serif");
});

test("keeps below-fold homepage media deferred", async ({ page }) => {
  const requestedImages: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (request.resourceType() === "image") requestedImages.push(url);
  });

  await page.goto("/");
  await page.waitForTimeout(100);

  const decodedRequests = requestedImages.map((url) => decodeURIComponent(url));
  expect(
    decodedRequests.some(
      (url) =>
        url.includes("cdn-images-1.medium.com") ||
        url.includes("/images/projects/") ||
        url.includes("books.google.com"),
    ),
  ).toBe(false);
  await expect(page.locator("[data-homepage-carousel]")).toHaveCount(0);
  await expect(page.locator("[data-homepage-lifting]")).toHaveCount(0);
});

test("positions deferred carousel images for fill layout", async ({ page }) => {
  // This assertion covers FlatHome's deferred carousel. On a WebGL-capable
  // runner the immersive world intentionally hides that document, so select
  // the supported reduced-motion path explicitly instead of racing the boot.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const imageWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      message.text().includes('has "fill" and parent element with invalid')
    ) {
      imageWarnings.push(message.text());
    }
  });

  await page.goto("/");
  await page
    .getByRole("heading", { name: "Book Notes" })
    .scrollIntoViewIfNeeded();
  await expect(page.locator("[data-homepage-carousel]")).toBeVisible();

  const parentPositions = await page
    .locator("[data-homepage-carousel] img")
    .evaluateAll((images) =>
      images.map((image) => getComputedStyle(image.parentElement!).position),
    );
  expect(new Set(parentPositions)).toEqual(new Set(["relative"]));
  expect(imageWarnings).toEqual([]);
});

test("server-renders books without an initial getAll request", async ({
  page,
}) => {
  const getAllRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("books.getAll")) {
      getAllRequests.push(request.url());
    }
  });

  await page.goto("/books");

  await expect(page.locator("[data-book-id]").first()).toBeVisible();
  expect(getAllRequests).toEqual([]);
});

test("calls the curated tag order Natural", async ({ page }) => {
  await page.setViewportSize({ width: 1222, height: 900 });
  await page.goto("/books");

  await page.getByRole("combobox", { name: "Tag ordering" }).click();
  await expect(page.getByRole("option", { name: "Natural" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Custom" })).toHaveCount(0);
});

test("does not load chart or markdown code on the initial books route", async ({
  page,
  request,
}) => {
  const scripts = new Set<string>();
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      scripts.add(response.url());
    }
  });

  await page.goto("/books");
  const sources = await Promise.all(
    [...scripts].map(async (url) => (await request.get(url)).text()),
  );
  const initialJavaScript = sources.join("\n");

  expect(initialJavaScript).not.toContain("react-markdown");
  expect(initialJavaScript).not.toContain("recharts");
  expect(initialJavaScript).not.toContain("BarChart");

  await page
    .getByRole("button", { name: "Reading statistics", exact: true })
    .click();
  await expect(page.locator(".recharts-wrapper")).toBeVisible();
});

test("uses static gradients when reduced motion is requested", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForTimeout(250);

  await expect(page.locator("canvas")).toHaveCount(0);
  await context.close();
});

test("hydrates theme-aware gradients without an attribute mismatch", async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const hydrationMismatches: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("hydrated but some attributes")) {
      hydrationMismatches.push(message.text());
    }
  });

  await page.goto("/");
  await expect(
    page.locator(
      'div[style*="var(--grainient-color-1)"][style*="var(--grainient-color-2)"]',
    ),
  ).toHaveCount(2);
  expect(hydrationMismatches).toEqual([]);
  await context.close();
});

test("delivers book analytics after deferred initialization", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const captured: string[] = [];
    (
      window as typeof window & { __capturedAnalytics?: string[] }
    ).__capturedAnalytics = captured;
    window.addEventListener("chappy:analytics-captured", (event) => {
      captured.push(
        (event as CustomEvent<{ event: string }>).detail.event,
      );
    });
  });
  await page.goto("/books");
  await page.locator("[data-book-id]").first().click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & { __capturedAnalytics?: string[] }
          ).__capturedAnalytics ?? [],
      ),
    )
    .toContain("book_viewed");
});

test("stays inside cold mobile transfer and web-vitals targets", async ({
  browser,
}) => {
  for (const target of [
    { path: "/", maxBytes: 1.5 * 1024 * 1024 },
    { path: "/books", maxBytes: 1024 * 1024 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await installWebVitalsObserver(page);
    await page.goto(target.path);
    await page.waitForTimeout(100);

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      const transferBytes =
        navigation.transferSize +
        performance
          .getEntriesByType("resource")
          .filter((entry) => entry.startTime <= navigation.loadEventEnd)
          .reduce(
            (total, entry) =>
              total + (entry as PerformanceResourceTiming).transferSize,
            0,
          );
      return {
        transferBytes,
        ...(window as PerfWindow).__coldLoadMetrics!,
      };
    });

    expect(metrics.transferBytes).toBeLessThanOrEqual(target.maxBytes);
    expect(metrics.lcp).toBeLessThan(2500);
    expect(metrics.cls).toBeLessThan(0.01);
    await context.close();
  }
});
