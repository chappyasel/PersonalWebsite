import {
  ABOUT_BOOT_COMPOSITION,
  aboutLandmarkNodeName,
} from "../../src/app/components/stacks/scene/aboutBootComposition";
import { SHELF_SURFACE } from "../../src/app/components/stacks/scene/shelfGeometry";
import { expect, test } from "@playwright/test";

type Bounds = {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
};

test.describe.configure({ timeout: 90_000 });

test("keeps landmark motion on synchronized compositor animations", async ({
  page,
}) => {
  await page.route("**/models/globe.glb", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  await page.goto("/?nomeadow&nopostfx", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".stacks-boot-scene")).toHaveAttribute(
    "data-boot-motion",
    "compositor",
  );

  const motion = await page
    .locator(".stacks-boot-item-motion")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const animations = node.getAnimations();
        const keyframes = animations.flatMap(
          (animation) =>
            (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [],
        );
        return {
          count: animations.length,
          playStates: animations.map((animation) => animation.playState),
          playbackRates: animations.map((animation) => animation.playbackRate),
          properties: keyframes.map((keyframe) =>
            Object.keys(keyframe)
              .filter(
                (key) =>
                  !["offset", "computedOffset", "easing", "composite"].includes(
                    key,
                  ),
              )
              .sort(),
          ),
        };
      }),
    );

  expect(motion).toHaveLength(ABOUT_BOOT_COMPOSITION.length);
  for (const item of motion) {
    expect(item.count).toBe(3);
    expect(item.playStates).toContain("running");
    expect(
      item.playStates.every(
        (state) => state === "running" || state === "finished",
      ),
    ).toBe(true);
    expect(item.playbackRates.every((rate) => rate === 1)).toBe(true);
    expect(
      item.properties?.every((keys) =>
        keys.every((key) => key === "opacity" || key === "transform"),
      ),
    ).toBe(true);
  }
});

test("shows the completed vignette without animation under reduced motion", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/?nomeadow&nopostfx", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".stacks-boot-scene")).toHaveAttribute(
    "data-boot-motion",
    "reduced",
  );
  const states = await page
    .locator(".stacks-boot-item-motion")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        animations: node.getAnimations().length,
        opacity: getComputedStyle(node).opacity,
        transform: getComputedStyle(node).transform,
      })),
    );
  expect(
    states.every(
      ({ animations, opacity, transform }) =>
        animations === 0 && opacity === "1" && transform === "none",
    ),
  ).toBe(true);
  await context.close();
});

test("keeps the boot composition synchronized with the live About shelf", async ({
  page,
}) => {
  await page.goto("/?harness&nomeadow&nopostfx", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.__stacks?.bbox));

  const landmarks = ABOUT_BOOT_COMPOSITION.map((landmark) => ({
    ...landmark,
    nodeName: aboutLandmarkNodeName(landmark.id),
  }));
  await expect
    .poll(
      () =>
        page.evaluate(
          (names) => names.every((name) => window.__stacks?.bbox(name)),
          landmarks.map(({ nodeName }) => nodeName),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);

  const liveBounds = await page.evaluate((entries) => {
    return Object.fromEntries(
      entries.map(({ id, nodeName }) => [
        id,
        window.__stacks?.bbox(nodeName) as Bounds,
      ]),
    );
  }, landmarks);

  const bootIds = await page
    .locator(".stacks-boot [data-landmark-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-landmark-id")),
    );
  expect(bootIds).toEqual(ABOUT_BOOT_COMPOSITION.map(({ id }) => id));
  expect(Object.keys(liveBounds)).toEqual(bootIds);

  for (const landmark of ABOUT_BOOT_COMPOSITION) {
    const bounds = liveBounds[landmark.id]!;
    expect(
      Math.abs(bounds.min[1] - SHELF_SURFACE[landmark.shelf]),
      `${landmark.id} must touch the ${landmark.shelf} shelf`,
    ).toBeLessThan(0.065);
  }

  for (const shelf of ["top", "lower"] as const) {
    const expected = ABOUT_BOOT_COMPOSITION.filter(
      (landmark) => landmark.shelf === shelf,
    ).map(({ id }) => id);
    const liveOrder = [...expected].sort(
      (a, b) => liveBounds[a]!.center[0] - liveBounds[b]!.center[0],
    );
    expect(liveOrder).toEqual(expected);
  }
});

const VIGNETTE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VIGNETTE_VIEWPORTS) {
    test(`matches the ${theme} ${viewport.width}x${viewport.height} boot vignette`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        colorScheme: theme,
        reducedMotion: "reduce",
        viewport,
      });
      const page = await context.newPage();
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("theme", selectedTheme);
      }, theme);
      await page.goto("/?nomeadow&nopostfx", {
        waitUntil: "domcontentloaded",
      });
      await page.addStyleTag({
        content: `
          html .stacks-boot {
            display: grid !important;
            opacity: 1 !important;
            visibility: visible !important;
            z-index: 9999 !important;
            transition: none !important;
          }
          html .stacks-boot-threshold,
          html[data-world="ready"] .stacks-boot-threshold,
          html .stacks-boot-entry,
          html .stacks-boot-item-motion {
            opacity: 1 !important;
            transform: none !important;
            animation: none !important;
            transition: none !important;
          }
        `,
      });
      await page.locator(".stacks-boot-scene").waitFor({ state: "visible" });
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(
        `about-boot-${theme}-${viewport.width}x${viewport.height}.png`,
        { animations: "disabled" },
      );
      await context.close();
    });
  }
}
