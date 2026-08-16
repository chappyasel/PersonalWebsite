import { expect, test } from "@playwright/test";

test("desktop cards own their native glass surfaces", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "light",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto("/");

  const panel = page.locator("[data-stacks-desktop-panel][data-stacks-active]");
  await expect(panel).toBeAttached();

  // A separately translated plate can lag compositor-driven native scrolling.
  // The card's own surface must therefore provide both fill and blur.
  await expect(panel.locator(".placard-plate")).toHaveCount(0);

  const scroller = panel.locator(".placard-scroll");
  const scrollBoundary = await scroller.evaluate((element) => {
    const chain: Array<{ tag: string; overscrollY: string }> = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      chain.push({
        tag: node.tagName.toLowerCase(),
        overscrollY: getComputedStyle(node).overscrollBehaviorY,
      });
    }
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
    });
    element.dispatchEvent(wheel);
    return {
      chain,
      wheelCanceled: wheel.defaultPrevented,
      maskImage: getComputedStyle(element).maskImage,
      webkitMaskImage: getComputedStyle(element).webkitMaskImage,
    };
  });
  expect(scrollBoundary.wheelCanceled).toBe(false);
  expect(
    scrollBoundary.chain.filter(({ overscrollY }) => overscrollY !== "auto"),
  ).toEqual([]);
  expect(scrollBoundary.maskImage).toBe("none");
  expect(scrollBoundary.webkitMaskImage).toBe("none");

  const surface = panel.locator("[data-placard-surface]").first();
  await expect(surface).toBeAttached();
  const material = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    const channels = style.backgroundColor.match(/(?:\d*\.)?\d+/g) ?? [];
    const hasAlpha =
      style.backgroundColor.startsWith("rgba") ||
      style.backgroundColor.includes("/");
    return {
      backdropFilter: style.backdropFilter,
      backgroundColor: style.backgroundColor,
      backgroundAlpha: hasAlpha ? Number(channels.at(-1)) : 1,
    };
  });

  expect(material.backdropFilter).not.toBe("none");
  expect(material.backdropFilter).toContain("brightness(1.4)");
  expect(material.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(material.backgroundAlpha).toBeGreaterThanOrEqual(0.16);
  expect(material.backgroundAlpha).toBeLessThanOrEqual(0.2);

  await context.close();
});

test("dark desktop cards retain their translucent native material", async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto("/");

  const surface = page
    .locator("[data-stacks-desktop-panel][data-stacks-active]")
    .locator("[data-placard-surface]")
    .first();
  await expect(surface).toBeAttached();
  const material = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    const color = style.backgroundColor;
    const channels = color.match(/(?:\d*\.)?\d+/g) ?? [];
    const hasAlpha = color.startsWith("rgba") || color.includes("/");
    return {
      backdropFilter: style.backdropFilter,
      backgroundAlpha: hasAlpha ? Number(channels.at(-1)) : 1,
    };
  });
  expect(material.backdropFilter).toContain("brightness(0.6)");
  expect(material.backgroundAlpha).toBeGreaterThanOrEqual(0.03);
  expect(material.backgroundAlpha).toBeLessThanOrEqual(0.07);

  await context.close();
});

test("dark desktop card hover deepens rather than lightens the fill", async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto("/");

  const surface = page
    .locator("[data-stacks-desktop-panel][data-stacks-active]")
    .locator("a[data-placard-surface], a [data-placard-surface]")
    .first();
  await expect(surface).toBeAttached();
  await surface.hover();
  await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0.12)");

  await context.close();
});

test("separate card backgrounds use a flat deterministic paint order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto("/");

  // The flat document remains server-rendered beneath the world, so it gives
  // us the exact ProjectItem DOM without depending on WebGL travel becoming
  // available in headless Chromium. Adding the placard scope exercises the
  // same paint-order CSS used by the resident desktop panel.
  const title = page.getByText("Weightlifting App", { exact: true }).first();
  await expect(title).toBeAttached();
  const paint = await title.evaluate((element) => {
    const section = element.closest("section");
    section?.classList.add("placard-scroll");
    const card = element.closest('[class*="preserve-3d"]');
    const motionLayer = card?.parentElement;
    const tiltRoot = motionLayer?.parentElement;
    const contentLayer = element.parentElement;
    const background = card?.querySelector("[data-placard-background]");
    if (!card || !motionLayer || !tiltRoot || !contentLayer || !background) {
      return null;
    }
    return {
      backgroundPointerEvents: getComputedStyle(background).pointerEvents,
      backgroundZ: getComputedStyle(background).zIndex,
      contentZ: getComputedStyle(contentLayer).zIndex,
      contentTransform: getComputedStyle(contentLayer).transform,
      cardTransformStyle: getComputedStyle(card).transformStyle,
      motionTransformStyle: getComputedStyle(motionLayer).transformStyle,
      tiltPerspective: getComputedStyle(tiltRoot).perspective,
    };
  });
  expect(paint).toEqual({
    backgroundPointerEvents: "none",
    backgroundZ: "0",
    contentZ: "1",
    contentTransform: "none",
    cardTransformStyle: "flat",
    motionTransformStyle: "flat",
    tiltPerspective: "none",
  });
});

test("clickable placard cards scale while static cards stay still", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto("/");

  // The flat document contains the same TiltCard instances reused by the
  // desktop placards. Scoping one card as a placard gives us a deterministic
  // reproduction without depending on WebGL travel in headless Chromium.
  const cards = page.locator("section [data-tilt-card-interactive]");
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(8);

  // Use a leaf interactive card. Parent/child cards cannot be hovered at the
  // same time by a real pointer, and sampling the entire server-rendered page
  // serially starves animation timers while WebGL is running in headless CI.
  const interactiveCard = page
    .locator(
      "section [data-tilt-card-interactive]:not(:has([data-tilt-card-interactive]))",
    )
    .first();
  const interactiveScale = await interactiveCard.evaluate(async (element) => {
    element.closest("section")?.classList.add("placard-scroll");
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    const motionLayer = element.querySelector("[data-tilt-motion]");
    const transform = motionLayer
      ? getComputedStyle(motionLayer).transform
      : "none";
    const matrix =
      transform === "none" ? null : new DOMMatrixReadOnly(transform);
    return matrix ? Math.hypot(matrix.a, matrix.b) : 1;
  });
  expect(interactiveScale).toBeGreaterThan(1.005);

  const staticCards = page.locator(
    "section [data-tilt-card]:not([data-tilt-card-interactive])",
  );
  if ((await staticCards.count()) > 0) {
    const staticCard = staticCards.first();
    const scale = await staticCard.evaluate(async (element) => {
      // The flat fallback can be visually hidden once WebGL resolves, but it
      // is the same resident component and its event semantics remain fully
      // testable without Playwright requiring an actionable hit target.
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      const motionLayer = element.querySelector("[data-tilt-motion]");
      const transform = motionLayer
        ? getComputedStyle(motionLayer).transform
        : "none";
      const matrix =
        transform === "none" ? null : new DOMMatrixReadOnly(transform);
      return matrix ? Math.hypot(matrix.a, matrix.b) : 1;
    });
    expect(scale).toBeCloseTo(1, 3);
  }
});
