import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1008, height: 1270 },
  deviceScaleFactor: 2,
  isMobile: false,
  hasTouch: false,
  colorScheme: "light",
});

test("universal search isolates typing and scroll ownership from the homepage", async ({
  page,
}) => {
  // Booting the full homepage, typing character by character and settling the
  // progressive providers does not fit a 60s budget on a cold dev server.
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    const focusEvents: Array<{
      type: string;
      target: string;
      relatedTarget: string;
      value: string;
    }> = [];
    Object.defineProperty(window, "__universalSearchFocusEvents", {
      configurable: true,
      value: focusEvents,
    });
    for (const type of ["focusin", "focusout"] as const) {
      document.addEventListener(
        type,
        (event) => {
          const target = event.target;
          const relatedTarget = event.relatedTarget;
          focusEvents.push({
            type,
            target:
              target instanceof Element
                ? target.getAttribute("aria-label") ??
                  target.getAttribute("data-testid") ??
                  target.tagName
                : "unknown",
            relatedTarget:
              relatedTarget instanceof Element
                ? relatedTarget.getAttribute("aria-label") ??
                  relatedTarget.getAttribute("data-testid") ??
                  relatedTarget.tagName
                : "none",
            value:
              target instanceof HTMLInputElement ? target.value : "",
          });
        },
        true,
      );
    }
  });

  await page.goto("/?nomeadow&nopostfx&harness=1", {
    waitUntil: "domcontentloaded",
  });
  const input = page.getByRole("combobox", { name: "Universal Search" });
  await expect
    .poll(
      async () => {
        if ((await input.count()) > 0) return true;
        await page.evaluate(() =>
          window.dispatchEvent(
            new CustomEvent("chappy:universal-search:open"),
          ),
        );
        return (await input.count()) > 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(input).toBeVisible({ timeout: 20_000 });
  await expect(input).toBeFocused();

  const query = "flashy dad";
  for (const character of query) {
    await page.keyboard.type(character, { delay: 80 });
    await expect(input).toBeFocused();
  }
  await expect(input).toHaveValue(query);

  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("");

  const list = page.locator("[cmdk-list]");
  await expect(list).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(input).toBeFocused();
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const bounds = await list.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  // Re-wheel on every poll. A single wheel's scroll lands on the compositor,
  // and on a loaded machine that can arrive after a fixed wait; repeating the
  // gesture asserts the palette owns the wheel without racing its delivery.
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 240);
      return list.evaluate((element) => element.scrollTop);
    })
    .toBeGreaterThan(0);
  await expect(input).toBeFocused();
});

test("typing survives a click on any part of the palette that is not the input", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/?nomeadow&nopostfx&harness=1", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByRole("combobox", { name: "Universal Search" });
  const material = page.locator("[data-universal-search-material]");

  const openPalette = async () => {
    await expect
      .poll(
        async () => {
          if (await input.isVisible().catch(() => false)) return true;
          await page.evaluate(() =>
            window.dispatchEvent(
              new CustomEvent("chappy:universal-search:open"),
            ),
          );
          return input.isVisible().catch(() => false);
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(input).toBeFocused();
  };

  // cmdk's root and its list are both tabindex="-1", as is Radix's panel, so a
  // mousedown anywhere but the input focuses a div. keydown still fires there
  // and beforeinput never does, which is exactly what "typing does nothing"
  // looked like. Every one of these spots reproduced it.
  const spots: Array<{ name: string; point: () => Promise<{ x: number; y: number } | null> }> = [
    {
      name: "footer hint",
      point: async () => {
        const box = await material.boundingBox();
        return box && { x: box.x + box.width - 12, y: box.y + box.height - 12 };
      },
    },
    {
      name: "magnifier icon",
      point: async () => {
        const box = await material.boundingBox();
        return box && { x: box.x + 30, y: box.y + 28 };
      },
    },
    {
      name: "list gap",
      point: async () => {
        const box = await page.locator("[cmdk-list]").boundingBox();
        return box && { x: box.x + box.width - 6, y: box.y + box.height - 6 };
      },
    },
  ];

  for (const spot of spots) {
    await openPalette();
    const point = await spot.point();
    expect(point, `${spot.name} should be on screen`).not.toBeNull();
    if (!point) return;

    await page.mouse.click(point.x, point.y);
    await expect(input, `${spot.name} should not steal focus`).toBeFocused();

    await page.keyboard.type("dad", { delay: 40 });
    await expect(input, `typing should survive ${spot.name}`).toHaveValue("dad");

    await page.keyboard.press("Escape");
    await expect(input).toBeHidden();
  }
});

declare global {
  interface Window {
    __universalSearchFocusEvents?: Array<{
      type: string;
      target: string;
      relatedTarget: string;
      value: string;
    }>;
  }
}
