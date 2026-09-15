import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("section changes retain scroll listeners while a real resize updates them", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/?quality=3&harness=1&nopostfx=1&nomeadow#systems");
  await page.waitForFunction(
    () =>
      window.__stacks?.state().controlsReady &&
      document.documentElement.dataset.roomView === "live",
  );
  const reconnects = await page.evaluate(async () => {
    const scroll = document.querySelector<HTMLElement>(
      '[aria-label="Horizontal scene navigation"]',
    )!;
    const add = scroll.addEventListener.bind(scroll);
    let count = 0;
    scroll.addEventListener = (
      ...args: Parameters<typeof scroll.addEventListener>
    ) => {
      if (args[0] === "scroll") count++;
      add(...args);
    };
    try {
      for (const unit of [1, 3, 5, 2, 6]) {
        window.__stacks!.scrollTo(unit, { instant: true });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      }
      return count;
    } finally {
      scroll.addEventListener = add;
    }
  });
  expect(reconnects).toBe(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = window.__stacks!.state() as unknown as {
          framebuffer: { css: [number, number] };
        };
        return state.framebuffer.css;
      }),
    )
    .toEqual([1280, 800]);
  await page.evaluate(() => window.__stacks!.scrollTo(3, { instant: true }));
  await expect
    .poll(async () => page.evaluate(() => window.__stacks!.state().activeUnit))
    .toBe(3);
});
