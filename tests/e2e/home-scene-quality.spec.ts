import { devices, expect, test } from "@playwright/test";

test.use({
  ...devices["iPhone 13"],
  browserName: "chromium",
  colorScheme: "light",
});

test("renders the active home scene at native iPhone density", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // SwiftShader at a native 3× phone DPR can spend the entire test budget
  // rasterizing the 12k-tuft meadow. This assertion is about DPR, selection,
  // and keyboard chrome, so exercise the supported degraded-render path.
  await page.goto("/?nomeadow&nopostfx", { waitUntil: "domcontentloaded" });
  await page
    .locator(".stacks-world-shell[data-canvas-ready] canvas")
    .waitFor({ state: "visible", timeout: 60_000 });
  const density = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".stacks-world-shell[data-canvas-ready] canvas",
    );
    if (!canvas) return null;
    const shell = canvas.closest<HTMLElement>(".stacks-canvas-shell");
    const boot = document.querySelector<HTMLElement>(".stacks-boot");
    return {
      actual: canvas.width / canvas.clientWidth,
      expected: window.devicePixelRatio,
      selection: shell ? getComputedStyle(shell).userSelect : null,
      bootSelection: boot ? getComputedStyle(boot).userSelect : null,
    };
  });
  expect(density).not.toBeNull();
  expect(density!.actual).toBeGreaterThanOrEqual(density!.expected - 0.1);
  expect(density!.selection).toBe("none");
  expect(density!.bootSelection).toBe("none");

  const themeToggle = page.locator("[data-theme-toggle]:visible").first();
  await themeToggle.focus();
  await expect(themeToggle).toBeFocused();
  expect(
    await themeToggle.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).not.toBe("none");
});
