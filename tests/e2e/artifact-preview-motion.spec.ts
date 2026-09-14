import { chromium, expect, test, webkit } from "@playwright/test";

for (const browserName of ["webkit", "chromium"] as const) {
  test.describe(`${browserName} artifact entrance`, () => {
    test("keeps a shelf-flat photo within the viewport throughout entrance and cleanup", async ({}, testInfo) => {
      const browser = await { chromium, webkit }[browserName].launch();
      const page = await browser.newPage({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: 390, height: 700 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      });
      try {
        test.setTimeout(90_000);
        await page.addInitScript(() => {
          sessionStorage.setItem("stacks-webgl-v1", "1");
          localStorage.setItem("theme", "dark");
        });
        await page.goto("/?harness=1&nomeadow&nopostfx", {
          waitUntil: "domcontentloaded",
        });
        await page.waitForFunction(
          () =>
            window.__stacks?.state().controlsReady &&
            document.documentElement.dataset.world === "ready",
        );
        const point = await page.evaluate(() => {
          const box = window.__stacks!.bbox(
            "stacks-about-landmark:collective-frame",
          )!;
          return window.__stacks!.project(
            ...(box.center as [number, number, number]),
          )!;
        });
        const recording = page.evaluate(
          () =>
            new Promise<{ maxWidth: number; replayedTransform: boolean }>(
              (resolve) => {
                const start = performance.now();
                let maxWidth = 0;
                let replayedTransform = false;
                const sample = () => {
                  const photo = [
                    ...document.querySelectorAll<HTMLElement>(
                      "[data-scene-artifact-preview-image]",
                    ),
                  ].find((node) =>
                    node.querySelector('img[src*="about-collective-group"]'),
                  );
                  if (
                    photo &&
                    Number(getComputedStyle(photo).opacity) > 0.01 &&
                    getComputedStyle(photo).visibility !== "hidden"
                  ) {
                    maxWidth = Math.max(
                      maxWidth,
                      photo.getBoundingClientRect().width,
                    );
                    replayedTransform ||= photo
                      .getAnimations()
                      .some(
                        (animation) =>
                          animation instanceof CSSTransition &&
                          animation.transitionProperty === "transform",
                      );
                    if (
                      !photo.hasAttribute(
                        "data-scene-artifact-preview-opening",
                      ) &&
                      performance.now() - start > 4000
                    ) {
                      resolve({ maxWidth, replayedTransform });
                      return;
                    }
                  }
                  if (performance.now() - start > 15_000) {
                    resolve({ maxWidth, replayedTransform });
                    return;
                  }
                  requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
              },
            ),
        );
        await page.touchscreen.tap(point.x, point.y);
        await expect(
          page
            .locator(
              '[data-scene-artifact-preview-image] img[src*="about-collective-group"]',
            )
            .first(),
        ).toBeVisible();
        const result = await recording;
        await testInfo.attach("measured-flight", {
          body: JSON.stringify(result),
          contentType: "application/json",
        });
        expect(result.maxWidth).toBeGreaterThan(300);
        expect(result.maxWidth).toBeLessThanOrEqual(390);
        expect(result.replayedTransform).toBe(false);
      } finally {
        await browser.close();
      }
    });
  });
}
