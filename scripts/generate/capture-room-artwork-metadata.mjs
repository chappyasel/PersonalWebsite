// Development-only recovery against the unchanged archive server. Never writes artwork.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const archive = process.argv.find((x) => x.startsWith("--archive="))?.slice(10);
if (!archive) throw Error("Pass --archive=/absolute/archive/worktree");
const { booksProfile } = await import(
  pathToFileURL(
    path.join(
      archive,
      "src/app/components/room-boot-prototype/booksProfile.ts",
    ),
  )
);
const { projectsProfile, weightliftingProfile, commonExclusions } =
  await import(
    pathToFileURL(
      path.join(archive, "src/app/components/room-boot-prototype/profiles.ts"),
    )
  );
const { createRoomBootShelfProfiles } = await import(
  pathToFileURL(
    path.join(
      archive,
      "src/app/components/room-boot-prototype/shelfProfiles.ts",
    ),
  )
);
const profiles = createRoomBootShelfProfiles({
  booksProfile,
  projectsProfile,
  weightliftingProfile,
  commonExclusions,
});
const out = "docs/reviews/production-artwork-metadata-recovery";
await fs.mkdir(out, { recursive: true });
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const plan = process.argv.includes("--books-pixels")
  ? [["books", "light-desktop"]]
  : [
      ["projects", "dark-desktop"],
      ["projects", "light-phone"],
      ["projects", "dark-phone"],
      ["books", "light-desktop"],
    ];
const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
async function mask(p) {
  const { data, info } = await sharp(Buffer.from(p.mask, "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: Uint8Array.from({ length: info.width * info.height }, (_, i) =>
      data[i * 4 + 3] >= 128 ? 1 : 0,
    ),
    width: info.width,
    height: info.height,
  };
}
function distances(mask, w, h) {
  const d = Int32Array.from(mask, (x) => (x ? 0 : 1e7));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) d[i] = Math.min(d[i], d[i - w] + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1);
    }
  return d;
}
const outcomes = [];
try {
  for (const [unit, label] of plan) {
    const profile = profiles[unit],
      phone = label.endsWith("phone"),
      theme = label.split("-")[0];
    const viewport = phone
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 };
    const original = JSON.parse(
      await fs.readFile(
        path.join(
          archive,
          `docs/reviews/room-boot-shelf-evidence/${unit}/${label}.json`,
        ),
        "utf8",
      ),
    );
    const approved = JSON.parse(
      await fs.readFile(
        `scripts/generate/room-artwork-inputs/${unit}/${label}/capture.json`,
        "utf8",
      ),
    );
    const sourceManifest = JSON.parse(
      await fs.readFile(
        path.join(
          archive,
          `public/room-boot-shelf-prototype/${unit}/${label}/manifest.json`,
        ),
        "utf8",
      ),
    );
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: theme,
      reducedMotion: "no-preference",
    });
    await context.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const url = new URL(profile.pathname, "http://127.0.0.1:3322");
    url.hash = profile.hash ?? "";
    url.search = "?harness=1&nomeadow=1&perf-profile=no-composer";
    let timer;
    const start = Date.now();
    console.log("START", unit, label, url.href);
    try {
      await page.goto(url.href, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.world === "ready" &&
          window.__enableRenderMasksPrototype,
        undefined,
        { timeout: 120000 },
      );
      await page.evaluate((index) => {
        window.__stacks.hover(null);
        if (window.__stacks.state().activeUnit !== index)
          window.__stacks.scrollTo(index, { instant: true });
        window.__enableRenderMasksPrototype(true);
      }, profile.index);
      await page.waitForFunction(
        () => !!window.__renderMasksPrototype,
        undefined,
        { timeout: 60000 },
      );
      await page.evaluate(
        (p) => window.__renderMasksPrototype.selectProfile(p),
        profile,
      );
      timer = setInterval(
        () =>
          void page
            .evaluate(() => {
              const s = window.__renderMasksPrototype.status();
              return {
                frames: s.renderedFrames,
                reasons: s.reasons,
                camera: s.cameraTravel,
              };
            })
            .then((s) => console.log(unit, label, s))
            .catch((error) => console.log("Status unavailable", String(error))),
        15000,
      );
      await page.waitForFunction(
        (index) => {
          const s = window.__renderMasksPrototype.status();
          if (s.activeUnit !== index) return false;
          const key = JSON.stringify([s.inventory, s.poseSignature, s.assets]);
          if (
            !s.ready ||
            s.renderedFrames < 8 ||
            window.__recoveryStable?.key !== key
          ) {
            window.__recoveryStable = { key, at: performance.now() };
            return false;
          }
          return performance.now() - window.__recoveryStable.at > 1200;
        },
        profile.index,
        { timeout: 180000, polling: 250 },
      );
      console.log("READY", unit, label);
      let dataIdentity = null;
      if (unit === "books")
        dataIdentity = await page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          let fiber =
            canvas?.[
              Object.keys(canvas).find((k) => k.startsWith("__reactFiber"))
            ];
          while (fiber) {
            const d = fiber.memoizedProps?.data;
            if (d?.featuredBooks && d.spineBooks)
              return {
                version: 1,
                featuredBooks: d.featuredBooks.map((b) => ({
                  id: b.id,
                  title: b.title,
                  author: b.author,
                  coverUrl: b.coverUrl,
                  pageCount: b.pageCount,
                  audioLengthMin: b.audioLengthMin,
                })),
                featuredBookColors: d.featuredBookColors,
                spineBooks: d.spineBooks,
              };
            fiber = fiber.return;
          }
          throw Error("Mounted StacksData unavailable on canvas ancestors");
        });
      const capture = await page.evaluate(
        ({ width, height, cameraContract }) => {
          window.__renderMasksPrototype.freeze();
          return window.__renderMasksPrototype.capture({
            width,
            height,
            fullComposition: true,
            compositionMargin: 1,
            cameraContract,
          });
        },
        {
          width: original.width,
          height: original.height,
          cameraContract: approved.camera,
        },
      );
      if (
        JSON.stringify(capture.camera.world) !==
          JSON.stringify(approved.camera.world) ||
        JSON.stringify(capture.camera.projection) !==
          JSON.stringify(approved.camera.projection)
      )
        throw Error("Saved camera contract changed");
      const scale = Math.min(
        500 / sourceManifest.parts.find((p) => p.id === "shelf").box[2],
        (viewport.width * 0.92) / sourceManifest.viewBox[2],
      );
      const comparisons = [];
      for (const oldPart of original.parts) {
        const now = capture.parts.find((p) => p.id === oldPart.id);
        if (!now) throw Error("Missing retained owner " + oldPart.id);
        const [a, b] = await Promise.all([mask(oldPart), mask(now)]);
        if (a.width !== b.width || a.height !== b.height)
          throw Error("Mask dimensions changed");
        const da = distances(a.data, a.width, a.height),
          db = distances(b.data, b.width, b.height);
        let max = 0,
          union = 0,
          intersection = 0;
        for (let i = 0; i < a.data.length; i++) {
          if (a.data[i] || b.data[i]) union++;
          if (a.data[i] && b.data[i]) intersection++;
          if (a.data[i]) max = Math.max(max, db[i]);
          if (b.data[i]) max = Math.max(max, da[i]);
        }
        comparisons.push({
          owner: oldPart.id,
          iou: intersection / union,
          maxManhattanRasterResidual: max,
          maxCssResidualUpperBound: max * scale,
          oldMaskSha256: hash(Buffer.from(oldPart.mask, "base64")),
          newMaskSha256: hash(Buffer.from(now.mask, "base64")),
        });
      }
      const maxCssResidualUpperBound = Math.max(
        ...comparisons.map((c) => c.maxCssResidualUpperBound),
      );
      const colourComparisons = [];
      if (unit === "books")
        for (const oldPart of original.parts) {
          const now = capture.parts.find((p) => p.id === oldPart.id);
          const [a, b] = await Promise.all(
            [oldPart, now].map((p) =>
              sharp(Buffer.from(p.colour, "base64"))
                .ensureAlpha()
                .raw()
                .toBuffer(),
            ),
          );
          if (a.length !== b.length) throw Error("Colour dimensions changed");
          let changedChannels = 0,
            maxChannelDifference = 0,
            totalDifference = 0;
          for (let i = 0; i < a.length; i++) {
            const delta = Math.abs(a[i] - b[i]);
            if (delta) changedChannels++;
            maxChannelDifference = Math.max(maxChannelDifference, delta);
            totalDifference += delta;
          }
          colourComparisons.push({
            owner: oldPart.id,
            changedChannels,
            maxChannelDifference,
            meanChannelDifference: totalDifference / a.length,
            oldColourSha256: hash(Buffer.from(oldPart.colour, "base64")),
            newColourSha256: hash(Buffer.from(now.colour, "base64")),
          });
        }
      const compact = { ...capture };
      for (const k of ["reference", "liveReference", "analyticReference"])
        delete compact[k];
      compact.parts = capture.parts.map((p) =>
        Object.fromEntries(
          Object.entries(p).filter(
            ([k]) =>
              ![
                "mask",
                "visibleMask",
                "sceneVisibleMask",
                "colour",
                "detail",
                "liveMask",
                "liveVisibleMask",
              ].includes(k),
          ),
        ),
      );
      const result = {
        unit,
        label,
        url: url.href,
        viewport,
        raster: [original.width, original.height],
        elapsedMs: Date.now() - start,
        errors,
        exactSavedCamera: true,
        comparisonMethod:
          "Symmetric maximum Manhattan distance between retained binary owner masks; conservative upper bound on Euclidean residual at reported CSS scale.",
        cssScale: scale,
        toleranceCssPx: 3,
        maxCssResidualUpperBound,
        compatible: maxCssResidualUpperBound <= 3 && errors.length === 0,
        comparisons,
        colourComparisons,
        dataIdentitySha256: dataIdentity
          ? hash(JSON.stringify(dataIdentity))
          : null,
      };
      await fs.writeFile(
        `${out}/${unit}-${label}.metadata.json`,
        JSON.stringify(compact) + "\n",
      );
      if (dataIdentity)
        await fs.writeFile(
          `${out}/books-data-identity.json`,
          JSON.stringify(dataIdentity) + "\n",
        );
      await fs.writeFile(
        `${out}/${unit}-${label}.comparison.json`,
        JSON.stringify(result, null, 2) + "\n",
      );
      outcomes.push(result);
      console.log(
        "COMPLETE",
        unit,
        label,
        "max CSS upper bound",
        maxCssResidualUpperBound,
        "compatible",
        result.compatible,
      );
    } catch (error) {
      const result = {
        unit,
        label,
        error: String(error),
        elapsedMs: Date.now() - start,
        errors,
      };
      outcomes.push(result);
      console.log("FAILED", result);
      await fs.writeFile(
        `${out}/${unit}-${label}.failure.json`,
        JSON.stringify(result, null, 2) + "\n",
      );
    } finally {
      clearInterval(timer);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/${process.argv.includes("--books-pixels") ? "books-pixels-summary" : "summary"}.json`,
    JSON.stringify(
      outcomes.map((outcome) => {
        const summary = { ...outcome };
        delete summary.comparisons;
        return summary;
      }),
      null,
      2,
    ) + "\n",
  );
  console.log("BROWSER_SLOT_FREE");
}
