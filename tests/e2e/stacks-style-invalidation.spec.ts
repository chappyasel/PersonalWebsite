import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 2036, height: 1270 } });

for (const hidden of [false, true]) {
  test(`local content changes do not restyle the resident room with UI ${hidden ? "hidden" : "visible"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/?quality=3&harness=1&nopostfx=1&nomeadow#systems");
    await page.waitForFunction(
      () => window.__stacks?.state().controlsReady,
      null,
      { timeout: 90_000 },
    );
    if (hidden) {
      await page.keyboard.press("h");
      await expect(page.locator("html")).toHaveAttribute(
        "data-chrome-hidden",
        "",
      );
    }
    const elementCount = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.id = "style-invalidation-probe";
      document.querySelector("[data-stacks-desktop-panel]")!.append(probe);
      void probe.offsetWidth;
      return document.querySelectorAll("*").length;
    });

    // Count affected elements rather than asserting wall time: this also runs
    // on software WebGL in CI. Each append/remove models a React content commit.
    const session = await page.context().newCDPSession(page);
    const events: Array<{
      name: string;
      ts: number;
      args?: { elementCount?: number };
    }> = [];
    // CDP exposes trace payloads as object[]; the selected categories define
    // the event fields read below.
    session.on("Tracing.dataCollected", ({ value }) =>
      events.push(...(value as unknown as typeof events)),
    );
    await session.send("Tracing.start", {
      categories: "devtools.timeline,blink.user_timing",
    });
    await page.evaluate(() => {
      const probe = document.getElementById("style-invalidation-probe")!;
      performance.mark("local-content-start");
      for (let i = 0; i < 5; i++) {
        const child = document.createElement("span");
        child.textContent = "Updated content";
        probe.append(child);
        void child.offsetWidth;
        child.remove();
        void probe.offsetWidth;
      }
      performance.mark("local-content-end");
    });
    const complete = new Promise<void>((resolve) =>
      session.once("Tracing.tracingComplete", () => resolve()),
    );
    await session.send("Tracing.end");
    await complete;
    await session.detach();

    const start = events.find(
      (event) => event.name === "local-content-start",
    )!.ts;
    const end = events.find((event) => event.name === "local-content-end")!.ts;
    const recalculations = events.filter(
      (event) =>
        event.name === "UpdateLayoutTree" &&
        event.ts >= start &&
        event.ts <= end,
    );
    expect(recalculations.length).toBeGreaterThanOrEqual(5);
    for (const event of recalculations) {
      // A local update may affect its panel, but cannot fan out to most of the
      // page (including the hidden UI and the other resident sections).
      expect(event.args?.elementCount).toBeLessThan(elementCount / 4);
    }
  });
}
