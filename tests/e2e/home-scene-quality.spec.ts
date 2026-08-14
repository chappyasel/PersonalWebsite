import { chromium, devices, expect, test } from "@playwright/test";

test("renders the active home scene at native iPhone density", async () => {
  test.setTimeout(90_000);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    colorScheme: "light",
  });
  try {
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForTimeout(5_000);
    const density = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".stacks-world-shell[data-canvas-ready] canvas",
      );
      if (!canvas) return null;
      return {
        actual: canvas.width / canvas.clientWidth,
        expected: window.devicePixelRatio,
      };
    });
    expect(density).not.toBeNull();
    expect(density!.actual).toBeGreaterThanOrEqual(density!.expected - 0.1);
  } finally {
    await context.close();
    await browser.close();
  }
});
