import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(
  new URL("../../../../styles/globals.css", import.meta.url),
  "utf8",
);
const component = fs.readFileSync(
  new URL("./BootScreen.tsx", import.meta.url),
  "utf8",
);

function rule(selector: string) {
  const found = css.indexOf(`\n${selector}`);
  expect(found, `${selector} should exist`).toBeGreaterThanOrEqual(0);
  const start = found + 1;
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("boot presentation", () => {
  it("paints the bookcase immediately instead of fading the whole entry in", () => {
    expect(rule(".stacks-boot-entry {")).not.toContain("animation:");
  });

  it("keeps animation velocity independent from discrete WebGL progress", () => {
    expect(component).not.toContain("subscribeLoadProgress");
    expect(component).not.toContain("updatePlaybackRate");
  });

  it("does not turn boot photos into render-priority resources", () => {
    expect(component).not.toContain("next/image");
    expect(component).not.toContain("priority=");
    expect(component).not.toContain('rel="preload"');
  });

  it("switches each object's authored material color with the page theme", () => {
    expect(rule(".stacks-boot-item {")).toContain("--stacks-boot-object-light");
    expect(rule(".dark .stacks-boot-item {")).toContain(
      "--stacks-boot-object-dark",
    );
    expect(rule(".stacks-boot-model-silhouette {")).toContain(
      "fill: var(--stacks-boot-object)",
    );
  });

  it("matches the compact top-left wordmark tracking", () => {
    const wordmark = rule(".stacks-boot-wordmark {");
    expect(wordmark).toContain("margin: 0 0 28px");
    expect(wordmark).toContain("color: hsl(var(--foreground) / 0.95)");
    expect(wordmark).toContain("font-size: clamp(28.56px, 3.162vw, 44.88px)");
    expect(wordmark).toContain("letter-spacing: -0.025em");
  });

  it("uses no radial background treatment in dark mode", () => {
    const darkRule = rule(".dark .stacks-boot {");
    expect(darkRule).toContain("background: linear-gradient(");
    expect(darkRule).not.toContain("radial-gradient(");
    expect(rule(".dark .stacks-boot-entry::before {")).toContain(
      "display: none",
    );
  });

  it("rotates the boot orb network and freezes it for reduced motion", () => {
    const network = rule(".stacks-boot-coordination-network {");

    expect(network).toContain("animation: stacks-boot-coordination-rotate");
    expect(network).toContain("transform-box: fill-box");
    expect(css).toContain("@keyframes stacks-boot-coordination-rotate");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.stacks-boot-coordination-network,[\s\S]*animation: none/,
    );
  });

  it("renders the orb fringe as crisp dither pixels", () => {
    const dither = rule(".stacks-boot-coordination-dither {");

    expect(dither).toContain("fill: #030507");
    expect(dither).toContain("shape-rendering: crispEdges");
  });
});
