import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.use({
  launchOptions: {
    args: [
      "--enable-gpu",
      "--use-angle=metal",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  },
});

for (const [profile, query] of [
  ["basic", "&nomeadow=1&nopostfx=1"],
  ["no-meadow", "&nomeadow=1"],
  ["full", ""],
] as const) {
  test(`${profile}: warm travel reuses framebuffer objects`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    await context.addInitScript(() => {
      const counters = {
        framebuffers: 0,
        textures: 0,
        deletedTextures: 0,
        links: 0,
      };
      const prototype = WebGL2RenderingContext.prototype;
      const createFramebuffer = prototype.createFramebuffer;
      const createTexture = prototype.createTexture;
      const deleteTexture = prototype.deleteTexture;
      const linkProgram = prototype.linkProgram;
      prototype.createFramebuffer = function () {
        counters.framebuffers++;
        return createFramebuffer.call(this);
      };
      prototype.createTexture = function () {
        counters.textures++;
        return createTexture.call(this);
      };
      prototype.deleteTexture = function (texture) {
        counters.deletedTextures++;
        return deleteTexture.call(this, texture);
      };
      prototype.linkProgram = function (program) {
        counters.links++;
        return linkProgram.call(this, program);
      };
      Object.assign(window, { __gpuAllocations: counters });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(
        new URL(
          `/?quality=showcase&harness=1${query}`,
          testInfo.project.use.baseURL,
        ).href,
        { waitUntil: "commit" },
      );
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.world === "ready" &&
          window.__stacks?.state().controlsReady,
        null,
        { timeout: 120_000 },
      );
      const travel = async (unit: number) => {
        await page.evaluate((index) => window.__stacks!.scrollTo(index), unit);
        await page.waitForFunction((index) => {
          const state = window.__stacks!.state();
          return (
            state.activeUnit === index &&
            !(state.quality as { moving: boolean }).moving
          );
        }, unit);
        // Include the deferred asset window, after camera settling.
        await page.waitForTimeout(1_000);
      };
      const snapshot = () =>
        page.evaluate(() => ({
          allocations: {
            ...(
              window as unknown as { __gpuAllocations: Record<string, number> }
            ).__gpuAllocations,
          },
          scene: window.__stacks!.state(),
        }));
      await travel(6);
      await travel(0);
      const before = await snapshot();
      await travel(6);
      await travel(0);
      const after = await snapshot();
      const evidencePath = testInfo.outputPath("gpu-resource-lifetime.json");
      await writeFile(
        evidencePath,
        JSON.stringify({ profile, before, after, errors }, null, 2),
      );
      await testInfo.attach("gpu-resource-lifetime.json", {
        path: evidencePath,
        contentType: "application/json",
      });
      expect(before.scene.dpr).toBe(2);
      expect(before.scene.framebuffer).toMatchObject({ buffer: [2880, 1800] });
      expect(after.scene.dpr).toBe(before.scene.dpr);
      expect(after.scene.framebuffer).toEqual(before.scene.framebuffer);
      if (profile !== "basic")
        expect(
          (after.scene.quality as { postprocessing: string }).postprocessing,
        ).toBe("full");
      expect(
        after.allocations.framebuffers! - before.allocations.framebuffers!,
      ).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
