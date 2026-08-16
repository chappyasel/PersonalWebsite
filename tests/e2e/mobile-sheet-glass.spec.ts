import { expect, test } from "@playwright/test";

// A cold production WebGL boot can consume most of Playwright's default 30s
// before the two-theme material probe begins. Keep the interaction assertions
// strict while giving the scene enough startup headroom on local/CI runners.
test.describe.configure({ timeout: 90_000 });

test("keeps the mobile sheet highly transparent in both themes", async ({
  browser,
}) => {
  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);
    await page.goto("/");

    const sheet = page.locator("[data-stacks-sheet-material].visible");
    await expect(sheet).toBeAttached();
    const material = await sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      const channels = style.backgroundColor.match(/(?:\d*\.)?\d+/g) ?? [];
      const hasAlpha =
        style.backgroundColor.startsWith("rgba") ||
        style.backgroundColor.includes("/");
      return {
        alpha: hasAlpha ? Number(channels.at(-1)) : 1,
        backgroundColor: style.backgroundColor,
        backdropFilter: style.backdropFilter,
        borderColor: style.borderTopColor,
        boxShadow: style.boxShadow,
      };
    });

    expect(material.alpha).toBeLessThanOrEqual(
      theme === "light" ? 0.18 : 0.001,
    );
    expect(material.backdropFilter).toContain(
      theme === "light" ? "blur(42px)" : "blur(32px)",
    );
    expect(material.backdropFilter).toContain(
      theme === "light" ? "brightness(1.18)" : "brightness(0.94)",
    );
    expect(material.borderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(material.boxShadow).toContain("inset");
    expect(material.boxShadow).not.toBe("none");

    const headingColors = await page
      .locator('[data-stacks-panel] [data-stacks-swap-part="header"]')
      .evaluate((element) => {
        const icon = element.querySelector("svg");
        const heading = element.querySelector("h2");
        return {
          icon: icon ? getComputedStyle(icon).color : null,
          text: heading ? getComputedStyle(heading).color : null,
        };
      });
    expect(headingColors.icon).not.toBeNull();
    expect(headingColors.icon).toBe(headingColors.text);

    const cardBackground = await page
      .locator("[data-stacks-panel] [data-placard-surface]")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(cardBackground).toBe(
      theme === "light" ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.3)",
    );

    await page.getByRole("button", { name: "Close" }).evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    const chip = page.locator("[data-stacks-chip]");
    await expect(chip).toBeVisible();
    const chipMaterial = await chip.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backdropFilter: style.backdropFilter,
        borderColor: style.borderTopColor,
        boxShadow: style.boxShadow,
      };
    });
    expect(chipMaterial.backgroundColor).toBe(material.backgroundColor);
    expect(chipMaterial.backdropFilter).toBe(material.backdropFilter);
    expect(chipMaterial.borderColor).toBe(material.borderColor);
    expect(chipMaterial.boxShadow).toContain("inset");
    await context.close();
  }
});

test("keeps one mobile sheet glass layer outside opacity fades", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-stacks-panel]")).toBeAttached();
  await page.waitForFunction(() => {
    const boot = document.querySelector(".stacks-boot");
    return !boot || getComputedStyle(boot).pointerEvents === "none";
  });
  await page.evaluate(() => {
    const expand = document.querySelector(
      '[data-stacks-panel] button[aria-label="Expand section panel"]',
    );
    if (!(expand instanceof HTMLButtonElement))
      throw new Error("missing expand control");
    expand.click();
  });
  await expect(
    page.locator('[data-stacks-panel][data-sheet="expanded"]'),
  ).toBeAttached();

  const overscroll = await page
    .locator("[data-stacks-panel] .placard-scroll")
    .evaluate(async (element) => {
      const chain: Array<{ tag: string; overscrollY: string }> = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
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
      await new Promise(requestAnimationFrame);
      const material = Array.from(
        document.querySelectorAll("[data-stacks-sheet-material]"),
      ).find(
        (candidate) => getComputedStyle(candidate).visibility !== "hidden",
      );
      const transform = material
        ? getComputedStyle(material).transform
        : "none";
      const sheetDragY =
        transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [moved],
        }),
      );
      return {
        chain,
        sheetDragY,
        touchMoveCanceled: moveEvent.defaultPrevented,
      };
    });
  expect(
    overscroll.chain.filter(({ overscrollY }) => overscrollY !== "auto"),
  ).toEqual([]);
  expect(overscroll.touchMoveCanceled).toBe(true);
  expect(overscroll.sheetDragY).toBeGreaterThan(20);

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
          for (
            let node = glass.parentElement;
            node;
            node = node.parentElement
          ) {
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

test("pulling down from the top of expanded content collapses to peek", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-stacks-panel]")).toBeAttached();
  await page.evaluate(() => {
    const expand = document.querySelector(
      '[data-stacks-panel] button[aria-label="Expand section panel"]',
    );
    if (!(expand instanceof HTMLButtonElement))
      throw new Error("missing expand control");
    expand.click();
  });
  const panel = page.locator('[data-stacks-panel][data-sheet="expanded"]');
  await expect(panel).toBeAttached();

  const scroller = panel.locator(".placard-scroll");
  const canceled = await scroller.evaluate((element) => {
    element.scrollTop = 0;
    const touchAt = (clientY: number) =>
      new Touch({
        identifier: 23,
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
    const moved = touchAt(260);
    const move = new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
      touches: [moved],
      targetTouches: [moved],
      changedTouches: [moved],
    });
    element.dispatchEvent(move);
    element.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [moved],
      }),
    );
    return move.defaultPrevented;
  });

  expect(canceled).toBe(true);
  await expect(
    page.locator('[data-stacks-panel][data-sheet="peek"]'),
  ).toBeAttached();
});

test("parks a dismissed sheet before revealing its pill during section travel", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto("/?harness=1");
  await expect(page.locator("[data-stacks-panel]")).toBeAttached();
  await page.waitForFunction(() => Boolean(window.__stacks));

  const assertExclusiveFor = async (durationMs: number) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < durationMs) {
      const bothVisible = await page.evaluate(() => {
        const visible = (element: Element | null) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            Number.parseFloat(style.opacity) > 0.02 &&
            rect.top < window.innerHeight - 1 &&
            rect.bottom > 1
          );
        };
        const anySheetVisible = Array.from(
          document.querySelectorAll("[data-stacks-mobile-panel]"),
        ).some(visible);
        const anyChipVisible = Array.from(
          document.querySelectorAll(".stacks-chip"),
        ).some(visible);
        return anySheetVisible && anyChipVisible;
      });
      expect(bothVisible).toBe(false);
      await page.waitForTimeout(25);
    }
  };

  await page.getByRole("button", { name: "Close" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  // Change resident ownership while the sheet-to-pill handoff is still in
  // flight. This used to cancel the incoming resident's parking callback,
  // leaving its sheet stranded and its pill unavailable or double-painted.
  await page.waitForTimeout(16);
  await page.evaluate(async () => {
    const interval = window.setInterval(
      () => window.__stacks?.scrollTo(1, { instant: true }),
      4,
    );
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    window.clearInterval(interval);
  });
  await assertExclusiveFor(900);

  await expect(page.locator("[data-stacks-chip]")).toBeVisible();
  const visibleSheets = await page
    .locator("[data-stacks-mobile-panel]")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            Number.parseFloat(style.opacity) > 0.02 &&
            rect.top < window.innerHeight - 1 &&
            rect.bottom > 1
          );
        }).length,
    );
  expect(visibleSheets).toBe(0);
});
