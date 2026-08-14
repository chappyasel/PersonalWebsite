import { type Page, expect, test } from "@playwright/test";

type StacksState = {
  activeUnit: number;
  controlsReady: boolean;
  dpr: number;
  framebuffer: {
    buffer: [number, number];
    css: [number, number];
    deviceDpr: number;
  };
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
  programs: number;
  quality: {
    durable: number;
    moving: boolean;
    effectiveDpr: number;
    postprocessing: string;
    meadowRung: number;
    cloudDetail: boolean;
  };
  measurement: {
    count: number;
    fps: number | null;
    frameMs: { p50: number; p95: number; p99: number } | null;
    droppedFrameRatio: number | null;
  };
};

async function stacksState(page: Page) {
  return page.evaluate(
    () => window.__stacks!.state() as unknown as StacksState,
  );
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("preserves an iPhone 3x framebuffer at the highest quality rung", async ({
  browser,
}) => {
  // SwiftShader is dramatically slower than an iPhone GPU at this pixel
  // count, so this test verifies resolution/renderer state only. Frame-time
  // sampling runs in the separate desktop lab below.
  test.setTimeout(240_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?quality=0&harness=1", { waitUntil: "commit" });
  await page.waitForFunction(
    () =>
      !!window.__stacks?.state().framebuffer &&
      window.__stacks.state().controlsReady === true &&
      document.querySelector("canvas")?.width === 1170,
    null,
    { timeout: 210_000 },
  );

  const state = await stacksState(page);
  expect(state.dpr).toBe(3);
  expect(state.framebuffer.buffer).toEqual([1170, 2532]);
  expect(state.quality).toMatchObject({
    durable: 0,
    effectiveDpr: 3,
    postprocessing: "off",
  });
  expect(state.programs).toBeGreaterThan(0);
  expect(runtimeErrors).toEqual([]);
  await context.close();
});

test("records fixed-checkpoint scene performance and renderer counters", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?quality=0&harness=1&nopostfx=1", {
    waitUntil: "commit",
  });
  await page.waitForFunction(
    () =>
      !!window.__stacks?.state().framebuffer &&
      window.__stacks.state().controlsReady === true,
    null,
    { timeout: 90_000 },
  );

  await page.evaluate(() => window.__stacks!.measure("start"));
  const checkpoints: StacksState[] = [];
  for (const unit of [0, 3, 6]) {
    await page.evaluate((index) => {
      window.__stacks!.scrollTo(index, { instant: true });
    }, unit);
    await expect
      .poll(async () => (await stacksState(page)).activeUnit)
      .toBe(unit);
    await page.waitForTimeout(1_000);
    checkpoints.push(await stacksState(page));
  }
  await page.evaluate(() => window.__stacks!.measure("stop"));

  const finalState = await stacksState(page);
  expect(finalState.measurement.count).toBeGreaterThan(3);
  expect(finalState.measurement.frameMs?.p95).toBeGreaterThan(0);
  expect(finalState.measurement.droppedFrameRatio).not.toBeNull();
  for (const state of checkpoints) {
    expect(state.calls).toBeGreaterThan(0);
    expect(state.triangles).toBeGreaterThan(0);
    expect(state.textures).toBeGreaterThan(0);
    expect(state.geometries).toBeGreaterThan(0);
    expect(state.programs).toBeGreaterThan(0);
  }

  await testInfo.attach("stacks-performance-checkpoints.json", {
    body: Buffer.from(
      JSON.stringify(
        { checkpoints, measurement: finalState.measurement },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  expect(runtimeErrors).toEqual([]);
});

test("movement preserves visual quality and durable rungs are forceable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?quality=0&harness=1&nopostfx=1", {
    waitUntil: "commit",
  });
  await page.waitForFunction(
    () =>
      !!window.__stacks?.state().framebuffer &&
      window.__stacks.state().controlsReady === true,
    null,
    {
      timeout: 60_000,
    },
  );

  await page.evaluate(() => window.__stacks!.scrollTo(3));
  const stillVisualQuality = (await stacksState(page)).quality;
  await expect
    .poll(async () => (await stacksState(page)).quality.moving, {
      timeout: 5_000,
    })
    .toBe(true);
  expect((await stacksState(page)).quality).toMatchObject({
    meadowRung: stillVisualQuality.meadowRung,
    cloudDetail: stillVisualQuality.cloudDetail,
  });
  await expect
    .poll(async () => (await stacksState(page)).quality.moving, {
      timeout: 8_000,
    })
    .toBe(false);
  expect((await stacksState(page)).quality).toMatchObject({
    meadowRung: stillVisualQuality.meadowRung,
    cloudDetail: stillVisualQuality.cloudDetail,
  });
  expect((await stacksState(page)).quality.durable).toBe(0);

  await page.evaluate(() => window.__stacks!.quality(2));
  await expect
    .poll(async () => (await stacksState(page)).quality.durable)
    .toBe(2);
  expect((await stacksState(page)).quality.effectiveDpr).toBeLessThanOrEqual(
    2.5,
  );
  expect(runtimeErrors).toEqual([]);
});
