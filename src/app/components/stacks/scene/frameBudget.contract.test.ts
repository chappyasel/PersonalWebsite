import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { SCENE_FRAME_BUDGET_MS } from "./frameBudget";

// The controller used to derive its frame budget from the device's own
// 10th-percentile frame time, which let a steady 40 Hz device define 40 Hz as
// success. The behavioural regression lives in quality.test.ts; this file
// guards the shape, so the derivation cannot quietly return somewhere else.

const read = (path: string) =>
  fs.readFileSync(new URL(path, import.meta.url), "utf8");

const sources = {
  "frameBudget.ts": read("./frameBudget.ts"),
  "quality.ts": read("./quality.ts"),
  "performanceMetrics.ts": read("./performanceMetrics.ts"),
  "performanceTrace.ts": read("./performanceTrace.ts"),
  "StacksCanvas.tsx": read("../StacksCanvas.tsx"),
  "devHudPresentation.ts": read("../dom/devHudPresentation.ts"),
  "SceneDiagnostics.tsx": read("../dom/SceneDiagnostics.tsx"),
};

/** Strip comments so prose describing the old policy cannot fail the check. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/(?<!:)\/\/.*$/gm, "");

describe("frame budget contract", () => {
  it("is an absolute sixtieth of a second", () => {
    expect(SCENE_FRAME_BUDGET_MS).toBe(1_000 / 60);
  });

  it("never rebuilds the old self-referential target", () => {
    for (const [name, source] of Object.entries(sources)) {
      // `Math.max(1000/60, <observed>)` was the exact former expression: a
      // floor at 60 Hz that any slower device raised above itself.
      expect(code(source), name).not.toMatch(
        /Math\.max\(\s*1_?000\s*\/\s*60\s*,/,
      );
    }
  });

  it("derives no decision threshold from a percentile of frame time", () => {
    for (const [name, source] of Object.entries(sources)) {
      const body = code(source);
      // A 10th percentile is the cadence estimate. It may only reach
      // `refreshHz`; anything else means a threshold learned it from the
      // device, which is the defect.
      const cadenceUses = body.match(/cadenceMs/g)?.length ?? 0;
      if (cadenceUses > 0) {
        expect(body, `${name} uses cadenceMs off the refreshHz path`).toMatch(
          /refreshHz:\s*Math\.round\(1000\s*\/\s*cadenceMs\)/,
        );
        expect(
          body,
          `${name} grades drops against observed cadence`,
        ).not.toMatch(/ms\s*>\s*cadenceMs\s*\*/);
      }
    }
  });

  it("grades dropped frames against the absolute budget everywhere", () => {
    for (const name of [
      "quality.ts",
      "performanceMetrics.ts",
      "performanceTrace.ts",
    ] as const) {
      const body = code(sources[name]);
      if (!/\*\s*1\.5/.test(body)) continue;
      expect(body, `${name} drops are budget-relative`).toMatch(
        /(SCENE_FRAME_BUDGET_MS|targetFrameMs)\s*\*\s*1\.5/,
      );
    }
  });

  it("keeps the budget in a leaf module the homepage can import cheaply", () => {
    // `StacksHome` statically imports the trace module, so a value import of
    // `quality.ts` from there drags the whole five-profile policy table into
    // the homepage bundle for one number. Measured cost when it did: about
    // 15 KB gzip.
    expect(code(sources["frameBudget.ts"])).not.toMatch(/^import\s/m);
    expect(code(sources["performanceTrace.ts"])).not.toMatch(
      /^import\s+\{[^}]*\}\s+from\s+"\.\/quality"/m,
    );
    expect(code(sources["performanceMetrics.ts"])).not.toMatch(
      /^import\s+\{[^}]*\}\s+from\s+"\.\/quality"/m,
    );
  });

  it("reports a fixed 60 Hz target rather than an observed refresh rate", () => {
    const body = code(sources["quality.ts"]);
    expect(body).toMatch(/targetHz:\s*SCENE_FRAME_BUDGET_HZ/);
    expect(body).not.toMatch(/targetHz:\s*Math\.min\(/);
  });

  it("keeps the display refresh estimate observed, since it can only be seen", () => {
    // The exemption is deliberate and narrow. If this stops being true the
    // overlay silently starts claiming every display is 60 Hz.
    expect(code(sources["performanceMetrics.ts"])).toMatch(
      /percentile\(sorted,\s*0\.1\)/,
    );
  });
});
