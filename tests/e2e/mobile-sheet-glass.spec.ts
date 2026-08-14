import { expect, test } from "@playwright/test";

test("keeps one mobile sheet glass layer outside opacity fades", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-stacks-panel]")).toBeAttached();
  await page.evaluate(() => {
    const expand = document.querySelector(
      '[data-stacks-panel] button[aria-label="Expand section panel"]',
    );
    if (!(expand instanceof HTMLButtonElement)) throw new Error("missing expand control");
    expand.click();
  });
  await expect(page.locator('[data-stacks-panel][data-sheet="expanded"]'))
    .toBeAttached();

  const overscroll = await page
    .locator("[data-stacks-panel] .placard-scroll")
    .evaluate((element) => {
      const chain: Array<{ tag: string; overscrollY: string }> = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        chain.push({
          tag: node.tagName.toLowerCase(),
          overscrollY: getComputedStyle(node).overscrollBehaviorY,
        });
      }
      element.scrollTop = 0;
      const touchAt = (clientY: number) =>
        new Touch({
          identifier: 17,
          target: element,
          clientX: 100,
          clientY,
          pageX: 100,
          pageY: clientY,
          screenX: 100,
          screenY: clientY,
        });
      const start = touchAt(100);
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [start],
          targetTouches: [start],
          changedTouches: [start],
        }),
      );
      const moved = touchAt(140);
      const moveEvent = new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [moved],
        targetTouches: [moved],
        changedTouches: [moved],
      });
      element.dispatchEvent(moveEvent);
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [moved],
        }),
      );
      return { chain, touchMoveCanceled: moveEvent.defaultPrevented };
    });
  expect(overscroll.chain.filter(({ overscrollY }) => overscrollY !== "auto"))
    .toEqual([]);
  expect(overscroll.touchMoveCanceled).toBe(false);

  const violation = await page.evaluate(async () => {
    const activePanel = document.querySelector("[data-stacks-panel]");
    const fadingContentLayer = activePanel?.parentElement;
    if (!(fadingContentLayer instanceof HTMLElement)) {
      return "missing content fade layer";
    }

    // Exercise the exact compositing boundary without depending on the WebGL
    // camera being ready to travel: the glass must not inherit this fade.
    fadingContentLayer.style.opacity = "0.5";
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
