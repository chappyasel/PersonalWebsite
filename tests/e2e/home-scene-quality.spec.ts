import { devices, expect, test } from "@playwright/test";

test.use({
  ...devices["iPhone 13"],
  browserName: "chromium",
  colorScheme: "light",
});

test("caps the active home scene at the narrow balanced density", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // This assertion covers the default narrow DPR, selection, and keyboard
  // chrome, so exercise the supported degraded-render path.
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
      selection: shell ? getComputedStyle(shell).userSelect : null,
      bootSelection: boot ? getComputedStyle(boot).userSelect : null,
    };
  });
  expect(density).not.toBeNull();
  expect(density!.actual).toBeCloseTo(1.75, 1);
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
