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

test("caps an iPhone framebuffer at 2x on the showcase rung", async ({
  browser,
}) => {
  // This verifies the narrow-viewport DPR policy and renderer state only.
  // Frame-time sampling runs in the separate desktop lab below.
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
      document.querySelector("canvas")?.width === 780,
    null,
    { timeout: 210_000 },
  );

  const state = await stacksState(page);
  expect(state.dpr).toBe(2);
  expect(state.framebuffer.buffer).toEqual([780, 1688]);
  expect(state.quality).toMatchObject({
    durable: 0,
    effectiveDpr: 2,
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
    {
      timeout: 60_000,
    },
  );

  const stillVisualQuality = (await stacksState(page)).quality;
  // Capture on animation frames inside the page. On SwiftShader a rendered
  // frame can monopolize the main thread longer than Playwright's polling
  // interval, so an out-of-page poll can miss the entire (real) moving state.
  const movementTrace = await page.evaluate(async () => {
    const trace: Array<{
      activeUnit: number;
      moving: boolean;
      meadowRung: number;
      cloudDetail: boolean;
    }> = [];
    window.__stacks!.scrollTo(3);
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const sample = () => {
        const state = window.__stacks!.state() as unknown as StacksState;
        trace.push({
          activeUnit: state.activeUnit,
          moving: state.quality.moving,
          meadowRung: state.quality.meadowRung,
          cloudDetail: state.quality.cloudDetail,
        });
        const moved = trace.some((item) => item.moving);
        if (
          (moved && state.activeUnit === 3 && !state.quality.moving) ||
          performance.now() - started > 12_000
        ) {
          resolve();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return trace;
  });
  expect(movementTrace.some((sample) => sample.moving)).toBe(true);
  expect(movementTrace.at(-1)).toMatchObject({ activeUnit: 3 });
  for (const sample of movementTrace.filter((item) => item.moving)) {
    expect(sample).toMatchObject({
      meadowRung: stillVisualQuality.meadowRung,
      cloudDetail: stillVisualQuality.cloudDetail,
    });
  }
  await expect
    .poll(async () => (await stacksState(page)).quality.moving, {
      timeout: 30_000,
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

// The Safety contract.
//
// Safety used to be defined by which knobs were turned, which is why it drifted
// to 422,831 triangles: a number that is not a "runs anywhere" number, with
// nothing in the build failing when it moved. It is now a budget, expressed
// against the reference viewport the mobile assertions already use.
//
// Triangles fail the build. Draw calls are recorded and reported but do not,
// because non-meadow geometry alone accounts for roughly 139 of them: any
// ceiling near 120 needs prop merging or prop levels of detail, which is
// separate work. Recording without asserting keeps that gap visible instead of
// letting it look closed.
//
// No frames-per-second figure is asserted anywhere here. Frame rate on shared
// runner hardware is not reproducible, which is exactly why the contract is
// triangles and pixels instead.
test("holds the Safety triangle budget at every unit checkpoint", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const MAX_TRIANGLES = 250_000;
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?quality=3&harness=1", { waitUntil: "commit" });
  await page.waitForFunction(
    () =>
      !!window.__stacks?.state().framebuffer &&
      window.__stacks.state().controlsReady === true,
    null,
    { timeout: 210_000 },
  );

  // First, middle and last of the traverse, so the shallowest and the deepest
  // views into the meadow are both covered.
  const observed: Array<{
    unit: number;
    triangles: number;
    calls: number;
    physicalPixels: number;
    contentTier: unknown;
  }> = [];
  for (const unit of [0, 3, 6]) {
    await page.evaluate((index) => {
      window.__stacks!.scrollTo(index, { instant: true });
    }, unit);
    // SwiftShader on a 3x mobile framebuffer settles slowly; the default
    // 5 second poll is not enough for the first checkpoint.
    await expect
      .poll(async () => (await stacksState(page)).activeUnit, {
        timeout: 30_000,
      })
      .toBe(unit);
    await page.waitForTimeout(1_000);
    const state = await stacksState(page);
    const quality = state.quality as unknown as {
      contentTier?: unknown;
      physicalPixels?: number;
    };
    observed.push({
      unit,
      triangles: state.triangles,
      calls: state.calls,
      physicalPixels: quality.physicalPixels ?? 0,
      contentTier: quality.contentTier ?? null,
    });
  }

  await testInfo.attach("stacks-safety-budget.json", {
    body: Buffer.from(
      JSON.stringify({ maxTriangles: MAX_TRIANGLES, observed }, null, 2),
    ),
    contentType: "application/json",
  });

  for (const checkpoint of observed) {
    expect(checkpoint.triangles).toBeGreaterThan(0);
    // The message carries the observed number so a regression reports its
    // size rather than only its existence.
    expect(
      checkpoint.triangles,
      `unit ${checkpoint.unit} drew ${checkpoint.triangles} triangles against a ${MAX_TRIANGLES} budget`,
    ).toBeLessThanOrEqual(MAX_TRIANGLES);
  }
  expect(runtimeErrors).toEqual([]);
  await context.close();
});
