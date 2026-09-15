import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("3D travel leaves illustrated geometry idle and a dimension switch resumes the row", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/?quality=3&harness=1&nopostfx=1&nomeadow#systems");
  await page.waitForFunction(
    () =>
      window.__stacks?.state().controlsReady &&
      document.documentElement.dataset.roomView === "live",
  );
  const row = await page.locator(".room-illustration-traverse").elementHandle();
  const reads = await page.evaluate(async () => {
    const illustration = document.querySelector(".room-illustration")!;
    const counts = { width: 0, rect: 0 };
    const width = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "clientWidth",
    )!;
    const rect = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "getBoundingClientRect",
    )!;
    Object.defineProperty(Element.prototype, "clientWidth", {
      ...width,
      get(this: Element) {
        if (illustration.contains(this)) counts.width++;
        return width.get!.call(this) as number;
      },
    });
    Object.defineProperty(Element.prototype, "getBoundingClientRect", {
      ...rect,
      value(this: Element) {
        if (illustration.contains(this)) counts.rect++;
        return (rect.value as Element["getBoundingClientRect"]).call(this);
      },
    });
    try {
      for (const unit of [0, 3, 6, 2, 6]) {
        window.__stacks!.scrollTo(unit, { instant: true });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }
      return counts;
    } finally {
      Object.defineProperty(Element.prototype, "clientWidth", width);
      Object.defineProperty(Element.prototype, "getBoundingClientRect", rect);
    }
  });
  expect(reads).toEqual({ width: 0, rect: 0 });
  await page.keyboard.press("r");
  await expect(page.locator("html")).toHaveAttribute(
    "data-room-view",
    "illustrated",
  );
  await expect(
    page.locator('img[data-room-artwork][data-unit="6"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (original) =>
        document.querySelector(".room-illustration-traverse") === original,
      row,
    ),
  ).toBe(true);
  await page.keyboard.press("r");
  await expect(page.locator("html")).toHaveAttribute("data-room-view", "live");
  expect(await page.evaluate(() => window.__stacks!.state().activeUnit)).toBe(
    6,
  );

  // Recovery has no manual dimension handoff position. Lose the actual GL
  // context after changing shelves while the illustrated effects are parked.
  await page.evaluate(() => window.__stacks!.scrollTo(3, { instant: true }));
  await page.waitForFunction(() => window.__stacks!.state().activeUnit === 3);
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const loss = gl.getExtension("WEBGL_lose_context");
    if (!loss) throw new Error("Context-loss simulation is unavailable");
    loss.loseContext();
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-room-view",
    "illustrated",
  );
  await expect(
    page.locator('img[data-room-artwork][data-unit="3"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const row = document.querySelector(".room-illustration-traverse")!;
      const selected = row.querySelector("[data-illustration-selected]")!;
      return Math.abs(
        selected.getBoundingClientRect().left -
          row.getBoundingClientRect().left,
      );
    }),
  ).toBeLessThan(1);
});
