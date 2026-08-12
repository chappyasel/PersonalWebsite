import { expect, test } from "@playwright/test";

test("keeps one mobile sheet glass layer outside opacity fades", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-stacks-panel]")).toBeAttached();

  const violation = await page.evaluate(async () => {
    const activePanel = document.querySelector("[data-stacks-panel]");
    const fadingContentLayer = activePanel?.parentElement;
    const expand = document.querySelector(
      '[data-stacks-panel] button[aria-label="Expand section panel"]',
    );
    if (!(fadingContentLayer instanceof HTMLElement)) {
      return "missing content fade layer";
    }
    if (!(expand instanceof HTMLButtonElement)) return "missing expand control";

    // Exercise the exact compositing boundary without depending on the WebGL
    // camera being ready to travel: the glass must not inherit this fade.
    fadingContentLayer.style.opacity = "0.5";
    expand.click();
    const startedAt = performance.now();
    let result: string | null = null;

    await new Promise<void>((resolve) => {
      const inspect = () => {
        const visibleGlass = Array.from(
          document.querySelectorAll("[data-stacks-sheet-material]"),
        ).filter((glass) => {
          const style = getComputedStyle(glass);
          return style.visibility !== "hidden" && style.display !== "none";
        });
        if (visibleGlass.length !== 1) {
          result = `visible glass layers: ${visibleGlass.length}`;
          resolve();
          return;
        }

        for (const glass of visibleGlass) {
          for (let node = glass.parentElement; node; node = node.parentElement) {
            const opacity = Number.parseFloat(getComputedStyle(node).opacity);
            if (opacity > 0 && opacity < 1) {
              result = `${glass.getAttribute("data-stacks-panel-unit") ?? "sheet"}: ancestor opacity ${opacity.toFixed(3)}`;
              resolve();
              return;
            }
          }
        }

        if (performance.now() - startedAt >= 1_000) {
          resolve();
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });

    return result;
  });

  expect(violation).toBeNull();
});
