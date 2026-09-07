import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const environment = readFileSync(
  fileURLToPath(new URL("./SceneEnvironment.tsx", import.meta.url)),
  "utf8",
);
const daylightSky = readFileSync(
  fileURLToPath(
    new URL("../../../../components/daylight/DaylightSky.tsx", import.meta.url),
  ),
  "utf8",
);
const daylightCss = readFileSync(
  fileURLToPath(new URL("../../../../styles/daylight.css", import.meta.url)),
  "utf8",
);

describe("daytime sky birds", () => {
  it("draws tapered silhouettes instead of equal-width line blocks", () => {
    expect(environment).toContain("float taperedSeg(");
    expect(environment).toContain("float birdSilhouette(");
    expect(environment).toContain("vec2 wrist =");
    expect(environment).toContain("float tail = max(");
    expect(environment).toContain("float wingHeight = 0.50");
    expect(environment).toContain("vec2(q.x * travelDir, q.y)");
    expect(environment).toContain("birdSilhouette(birdQ");
    expect(environment).not.toContain("float segD(");
  });

  it("keeps the shallow-M wing pair on the daylight hero", () => {
    // The dome shader draws a tapered side-profile gull; the CSS hero once
    // copied it as a filled body with one wing, and at 21px on a flat sky it
    // read as a fish flapping its tail (owner, 2026-09-07). The hero keeps
    // the body blob with two stroked wings, each articulated at shoulder and
    // elbow, and the flock's V and presence cycles from the same rework.
    expect(daylightSky).not.toContain('className="dl-bird-body"');
    expect(daylightSky).toContain("dl-wing-l");
    expect(daylightSky).toContain("dl-wing-r");
    expect(daylightSky).toContain("dl-tip-r");
    expect(daylightSky).toContain('stroke="currentColor"');
    expect(daylightCss).toContain("@keyframes dl-flap-r");
    expect(daylightCss).toContain("@keyframes dl-tip-flap-r");
  });

  it("keeps each pass alive until it clears both sides of the sky", () => {
    expect(environment).toContain("-2.72 + 1.72 * flightT");
    expect(environment).toContain("smoothstep(0.945, 1.0, bt)");
    expect(daylightCss).toContain("transform: translateX(-110px)");
    expect(daylightCss).toContain("transform: translateX(calc(100vw + 110px))");
  });

  it("varies flock size, formation and wing timing", () => {
    expect(environment).toContain(
      "float birdCount = 2.0 + floor(hash1(flock + 0.4) * 4.0)",
    );
    expect(environment).toContain("for (int bi2 = 0; bi2 < 5; bi2++)");
    expect(environment).toContain("float side = mod(bf, 2.0) * 2.0 - 1.0");
    expect(daylightSky).toContain("dl-bird-c");
    expect(daylightSky).toContain("dl-bird-d");
    expect(daylightCss).toContain("dl-bird-presence-c 104s");
    expect(daylightCss).toContain("dl-bird-presence-d 156s");
    expect(daylightCss).not.toContain("--dl-bird-heading");
  });
});
