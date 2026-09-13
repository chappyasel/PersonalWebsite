import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://localhost:3334";
const out =
  process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ??
  "docs/reviews/illustrated-room-integration-evidence/raw";
const units = [
  { route: "/", slug: "about", asset: null },
  { route: "/#books", slug: "books", asset: "books" },
  { route: "/#weightlifting", slug: "training", asset: "weightlifting" },
  { route: "/#systems", slug: "systems", asset: "systems" },
  { route: "/projects", slug: "projects", asset: "projects" },
  { route: "/musings", slug: "blog", asset: "musings" },
  { route: "/talks", slug: "talks", asset: "talks" },
];
const routeUnit = (route) => {
  const url = new URL(route, base);
  const slug = (url.hash || url.pathname).replace(/^[/#]|\/$/g, "") || "about";
  const unit = units.findIndex(
    (entry) => entry.slug === slug || entry.asset === slug,
  );
  assert.ok(unit >= 0, `Unknown room route: ${route}`);
  return unit;
};
const routes = process.argv.includes("--all-shelves")
  ? units.map((entry) => entry.route)
  : [
      process.argv.find((arg) => arg.startsWith("--route="))?.slice(8) ??
        "/projects",
    ];
await fs.mkdir(out, { recursive: true });
async function installTrace(page) {
  await page.addInitScript(() => {
    localStorage.setItem("stacks-scene-sound-muted:v1", "true");
    window.__entryTrace = [];
    window.__entryTraceStop = false;
    const box = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect ? [rect.x, rect.y, rect.width, rect.height] : null;
    };
    const opacity = (node) => {
      if (!node) return null;
      let value = 1;
      for (
        let current = node;
        current instanceof Element;
        current = current.parentElement
      ) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return 0;
        value *= Number(style.opacity);
      }
      return value;
    };
    const inspect = () => {
      if (window.__entryTraceStop || window.__entryTrace.length >= 4000) return;
      const shell = document.querySelector("[data-room-entrance]");
      if (shell) {
        const stops = [...shell.querySelectorAll(".room-illustration-stop")];
        const selected = shell.querySelector("[data-illustration-selected]");
        const stage = selected?.querySelector(".room-illustration-stage");
        const image = stage?.querySelector(
          "img[data-illustration-image], svg.stacks-boot-scene",
        );
        const style = stage ? getComputedStyle(stage) : null;
        const stopBox = box(selected);
        const nav = shell.querySelector(
          innerWidth >= 1200
            ? ".stacks-unit-rail-desktop"
            : ".stacks-unit-rail-mobile",
        );
        const panel = shell.querySelector(
          innerWidth >= 1200
            ? "[data-stacks-desktop-panel][data-stacks-active]"
            : '[data-stacks-mobile-intro="sheet"][data-stacks-panel]',
        );
        const card =
          innerWidth >= 1200
            ? panel?.querySelector("[data-placard-surface]")
            : panel;
        const items = [
          ...(stage?.querySelectorAll(
            '.room-entrance-artwork svg > g[data-part]:not([data-part="shelf"]), .stacks-boot-landmarks .stacks-boot-item-motion',
          ) ?? []),
        ];
        const animated = document
          .getAnimations()
          .map((animation) => animation.effect?.target)
          .filter(
            (target) =>
              target instanceof Element &&
              shell.contains(target) &&
              target.matches(
                ".room-entrance-item, .stacks-boot-landmarks .stacks-boot-item-motion",
              ),
          );
        const picture = stage?.querySelector(".room-illustration-picture");
        const emptySource = picture
          ? getComputedStyle(picture).backgroundImage
          : null;
        const shelf = stage?.querySelector(
          '.room-entrance-artwork g[data-part="shelf"], .stacks-boot-supports',
        );
        window.__entryTrace.push({
          at: performance.now(),
          phase: shell.dataset.roomEntrance,
          presentation: shell.dataset.roomPresentation,
          canvasReady: shell.hasAttribute("data-canvas-ready"),
          url: location.pathname + location.hash,
          positioned: Boolean(
            selected?.closest("[data-illustration-positioned]"),
          ),
          selectedUnit: stops.indexOf(selected),
          selectedSource:
            image instanceof HTMLImageElement
              ? new URL(image.currentSrc || image.src).pathname
              : image
                ? "about"
                : null,
          navOpacity: opacity(nav),
          cardOpacity: opacity(card),
          cardUnit:
            panel?.getAttribute("data-stacks-desktop-panel") ??
            panel?.getAttribute("data-stacks-panel-unit") ??
            null,
          box: box(image),
          stageBox: box(stage),
          restBox:
            style && stopBox
              ? [
                  stopBox[0] + parseFloat(style.left),
                  stopBox[1] + parseFloat(style.top),
                  parseFloat(style.width),
                  parseFloat(style.height),
                ]
              : null,
          stageTransform: style?.transform ?? null,
          stageIdentity: Boolean(
            style &&
              new DOMMatrixReadOnly(style.transform).isIdentity &&
              ["none", "0px", "0px 0px"].includes(style.translate) &&
              ["none", "1", "1 1"].includes(style.scale),
          ),
          staticImageVisible:
            image instanceof HTMLImageElement ? opacity(image) > 0.01 : null,
          emptySource,
          shelfVisible: shelf
            ? opacity(shelf) > 0.01
            : Boolean(
                emptySource?.includes(".shelf.svg") && opacity(picture) > 0.01,
              ),
          itemIds: items.map(
            (item, index) =>
              item.getAttribute("data-part") ??
              item.parentElement?.getAttribute("data-landmark-id") ??
              String(index),
          ),
          itemOpacities: items.map(opacity),
          itemOwnOpacities: items.map((item) =>
            Number(getComputedStyle(item).opacity),
          ),
          animatedUnits: [
            ...new Set(
              animated.map((item) =>
                stops.indexOf(item.closest(".room-illustration-stop")),
              ),
            ),
          ],
          animatedItemCount: animated.length,
          overlayUnits: [
            ...shell.querySelectorAll(".room-entrance-artwork"),
          ].map((node) =>
            stops.indexOf(node.closest(".room-illustration-stop")),
          ),
          registeredCount: shell.querySelectorAll(
            "[data-room-artwork][data-artwork-key]",
          ).length,
        });
      }
      requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  });
}
function assertNoEarlyHandoff(trace) {
  for (const frame of trace) {
    if (frame.phase !== "complete") {
      assert.equal(
        frame.registeredCount,
        0,
        `Artwork registered during ${frame.phase}`,
      );
      assert.ok(
        !["dissolve", "travel", "live"].includes(frame.presentation),
        `Early ${frame.presentation} during ${frame.phase}`,
      );
    }
    if (["dissolve", "travel"].includes(frame.presentation)) {
      assert.equal(
        frame.canvasReady,
        true,
        "Dissolve preceded a live canvas frame",
      );
      assert.equal(
        frame.stageIdentity,
        true,
        "Dissolve preceded final placement",
      );
    }
  }
}
function assertSequence(trace, unit, width, height) {
  const phases = [...new Set(trace.map((frame) => frame.phase))];
  assert.deepEqual(phases, [
    "shelf",
    "items",
    "placing",
    "content",
    "navigation",
    "complete",
  ]);
  assertNoEarlyHandoff(trace);
  const early = trace.filter((frame) =>
    ["shelf", "items", "placing"].includes(frame.phase),
  );
  assert.ok(
    early.some(
      (frame) => frame.cardOpacity !== null && frame.navOpacity !== null,
    ),
    "No initial content/chrome measurements",
  );
  for (const frame of early) {
    if (frame.navOpacity !== null)
      assert.ok(
        frame.navOpacity <= 0.01,
        `Navigation visible during ${frame.phase}: ${frame.navOpacity}`,
      );
    if (frame.cardOpacity !== null)
      assert.ok(
        frame.cardOpacity <= 0.01,
        `Content visible during ${frame.phase}: ${frame.cardOpacity}`,
      );
  }
  for (const frame of trace) {
    for (const owner of [...frame.animatedUnits, ...frame.overlayUnits])
      assert.equal(owner, unit, `Another shelf animated at ${frame.at}ms`);
    if (["items", "placing", "content", "navigation"].includes(frame.phase)) {
      assert.equal(
        frame.positioned,
        true,
        "Assembly preceded initial URL positioning",
      );
      assert.equal(frame.selectedUnit, unit, "Wrong selected shelf");
      assert.equal(routeUnit(frame.url), unit, "URL changed during assembly");
      if (unit === 0) assert.equal(frame.selectedSource, "about");
      else
        assert.ok(
          frame.selectedSource?.startsWith(
            `/images/stacks/boot/${units[unit].asset}/`,
          ),
          "Wrong artwork source",
        );
    }
    if (frame.phase === "content" && frame.navOpacity !== null)
      assert.ok(frame.navOpacity <= 0.01, "Navigation arrived before content");
  }
  const empty = trace.find(
    (frame) =>
      frame.phase === "shelf" &&
      frame.positioned &&
      frame.selectedUnit === unit &&
      frame.shelfVisible &&
      frame.itemOpacities.every((value) => value <= 0.01) &&
      frame.staticImageVisible !== true,
  );
  assert.ok(empty, "No visible empty shelf frame");
  if (unit !== 0)
    assert.ok(
      empty.emptySource?.includes(`/${units[unit].asset}/`) &&
        empty.emptySource.includes(".shelf.svg"),
      "Wrong empty shelf artifact",
    );
  assert.ok(empty.stageBox && empty.restBox, "No initial stage box");
  assert.ok(
    Math.abs(empty.stageBox[2] / empty.restBox[2] - 0.78) < 0.01,
    "Initial scale differs from 0.78",
  );
  // Traverse already accepts a 1px stop error when snapping. Baseline
  // artwork reproduces the same 0.75 to 0.84px offset on four desktop stops.
  const horizontalCenterError = Math.abs(
    empty.stageBox[0] + empty.stageBox[2] / 2 - width / 2,
  );
  assert.ok(
    horizontalCenterError <= 1,
    `Initial shelf is not centered horizontally: ${horizontalCenterError}px`,
  );
  assert.ok(
    Math.abs(empty.stageBox[1] + empty.stageBox[3] / 2 - height * 0.45) < 0.75,
    "Initial shelf has the wrong center height",
  );
  const items = trace.filter((frame) => frame.phase === "items");
  assert.ok(
    items.some((frame) => frame.animatedItemCount >= 2),
    "No actual WAAPI item animation",
  );
  const staggered = items.find(
    (frame) =>
      frame.itemOpacities.length >= 2 &&
      Math.min(...frame.itemOpacities) < 0.05 &&
      Math.max(...frame.itemOpacities) > 0.6 &&
      frame.itemOpacities.some((value) => value > 0.05 && value < 0.95),
  );
  assert.ok(staggered, "No intermediate staggered item opacity");
  for (const frame of items) {
    assert.equal(
      frame.staticImageVisible === true,
      false,
      "Full drawing leaked through item reveal",
    );
    assert.ok(
      frame.stageBox &&
        frame.restBox &&
        Math.abs(frame.stageBox[2] / frame.restBox[2] - 0.78) < 0.01,
      "Stage moved before placing",
    );
  }
  const placing = trace.filter((frame) => frame.phase === "placing");
  assert.ok(
    placing.some(
      (frame) =>
        frame.stageBox &&
        frame.restBox &&
        frame.stageBox[2] / frame.restBox[2] > 0.81 &&
        frame.stageBox[2] / frame.restBox[2] < 0.99,
    ),
    "No intermediate placement growth",
  );
  assert.ok(
    placing.every(
      (frame) =>
        frame.itemOpacities.length >= 2 &&
        frame.itemOpacities.every((value) => value >= 0.99),
    ),
    "Placement preceded item completion",
  );
  const final = trace.at(-1);
  assert.equal(
    final.stageIdentity,
    true,
    `Final transform: ${final.stageTransform}`,
  );
  assert.ok(
    final.stageBox && final.restBox && final.box,
    "Missing final boxes",
  );
  final.stageBox.forEach((value, axis) =>
    assert.ok(
      Math.abs(value - final.restBox[axis]) < 0.5,
      `Final stage differs from rest frame on axis ${axis}`,
    ),
  );
  final.box.forEach((value, axis) =>
    assert.ok(
      Math.abs(value - final.stageBox[axis]) < 0.5,
      `Final measured drawing differs from stage on axis ${axis}`,
    ),
  );
  assert.ok(
    final.stageBox[2] > empty.stageBox[2] * 1.15,
    "Shelf did not grow to final size",
  );
  assert.equal(final.navOpacity, 1);
  assert.equal(final.cardOpacity, 1);
  assert.equal(
    final.cardUnit,
    units[unit].slug,
    "Final content belongs to another shelf",
  );
  assert.equal(
    final.overlayUnits.length,
    0,
    "Temporary SVG survived completion",
  );
  assert.equal(
    final.registeredCount,
    1,
    "Final drawing is not the sole registration target",
  );
  if (unit !== 0)
    assert.equal(final.staticImageVisible, true, "Final image stayed hidden");
  return {
    phases,
    staggeredAt: staggered.at,
    emptyBox: empty.stageBox,
    finalBox: final.stageBox,
  };
}
const results = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal"],
});
try {
  for (const { route, unit, width, height } of routes.flatMap((route) =>
    [
      [1440, 900],
      [390, 844],
    ].map(([width, height]) => ({
      route,
      unit: routeUnit(route),
      width,
      height,
    })),
  )) {
    const name = `entrance-${units[unit].slug}-${width}`;
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installTrace(page);
    try {
      const url = new URL(route, base);
      url.searchParams.set("hold-boot", "1");
      await page.goto(url.href, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForFunction(
        () => {
          const frame = window.__entryTrace?.at(-1);
          return (
            frame?.phase === "complete" &&
            frame.stageIdentity &&
            frame.registeredCount === 1 &&
            frame.navOpacity === 1 &&
            frame.cardOpacity === 1
          );
        },
        undefined,
        { timeout: 15000 },
      );
      const trace = await page.evaluate(() => {
        window.__entryTraceStop = true;
        return window.__entryTrace;
      });
      const summary = assertSequence(trace, unit, width, height);
      assert.equal(await page.locator(".room-illustrated-chrome").count(), 1);
      assert.equal(
        await page.locator(".stacks-scene-controls:visible").count(),
        0,
      );
      assert.equal(
        await page.locator(".room-illustrated-chrome button").count(),
        1,
      );
      await page.waitForSelector(
        '[data-sound-toggle][data-sound-state="muted"]',
        { state: "attached" },
      );
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${out}/${name}.png` });
      results.push({
        name,
        route,
        passed: true,
        ...summary,
        errors,
        trace,
      });
      console.log("PASS", name);
    } catch (error) {
      await page
        .screenshot({ path: `${out}/${name}-failure.png` })
        .catch(() => undefined);
      results.push({
        name,
        route,
        passed: false,
        error: String(error),
        errors,
        trace: await page.evaluate(() => window.__entryTrace).catch(() => null),
      });
      console.log("FAIL", name, String(error));
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
  for (const [route, width, height] of process.argv.includes("--entrance-only")
    ? []
    : [
        ["/projects", 1200, 900],
        ["/projects", 1024, 768],
        ["/projects", 2560, 1440],
        ["/projects", 820, 1180],
        ["/#books", 1200, 900],
      ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installTrace(page);
    try {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.documentElement.dataset.roomView === "live",
        undefined,
        { timeout: 45000 },
      );
      const trace = await page.evaluate(() => {
        window.__entryTraceStop = true;
        return window.__entryTrace;
      });
      assertNoEarlyHandoff(trace);
      assert.ok(
        trace.some((frame) => frame.phase === "complete"),
        "Live entry skipped completion",
      );
      assert.equal(await page.locator(".room-illustrated-chrome").count(), 0);
      await page.waitForSelector(".stacks-scene-controls");
      assert.deepEqual(errors, []);
      results.push({
        name: `cold-${route}-${width}x${height}`,
        passed: true,
        automaticEntry: true,
        errors,
        trace,
      });
      console.log("PASS", `cold-${route}-${width}x${height}`);
    } catch (error) {
      results.push({
        name: `cold-${route}-${width}x${height}`,
        passed: false,
        error: String(error),
        errors,
      });
      console.log("FAIL", `cold-${route}-${width}x${height}`, String(error));
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/entrance.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}
