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

  it("places the wordmark beneath the shelf with compact tracking", () => {
    const wordmark = rule(".stacks-boot-wordmark {");
    expect(wordmark).toContain("margin: 28px 0 0");
    expect(wordmark).toContain("color: hsl(var(--foreground) / 0.95)");
    expect(wordmark).toContain("font-size: clamp(28.56px, 3.162vw, 44.88px)");
    expect(wordmark).toContain("letter-spacing: -0.025em");
    expect(
      component.indexOf('className="stacks-boot-wordmark"'),
    ).toBeGreaterThan(component.indexOf("</svg>"));
  });

  it("uses no radial background treatment in dark mode", () => {
    const darkRule = rule(".dark .stacks-boot {");
    expect(darkRule).toContain("background: linear-gradient(");
    expect(darkRule).not.toContain("radial-gradient(");
    expect(rule(".dark .stacks-boot-scene-stage::before {")).toContain(
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

  it("waits three seconds, then fades the loading copy in over two", () => {
    const wait = rule(".stacks-boot-wait {");

    expect(wait).toContain("opacity: 0");
    expect(wait).toContain("stacks-boot-wait-arrive 2s");
    expect(wait).toContain("3s");
    expect(css).toContain("@keyframes stacks-boot-wait-note");
    expect(rule(".stacks-boot-wait-note {")).toContain(
      "var(--stacks-boot-wait-cycle)",
    );
    expect(component).toContain("createBootDustDrift(");
    expect(component).toContain("iterations: Number.POSITIVE_INFINITY");
    expect(css).not.toContain("@keyframes stacks-boot-firefly-wander");
    expect(rule(".stacks-boot-motes {")).toContain(
      "stacks-boot-motes-arrive 3s ease-out 2s forwards",
    );
  });

  it("gives Loading more weight than the supporting notes", () => {
    const label = rule(".stacks-boot-wait-label {");

    expect(label).toContain("font-size: clamp(15px, 1.35vw, 17px)");
    expect(label).toContain("font-weight: 500");
    expect(css).toContain("@keyframes stacks-boot-wait-dot");
    expect(rule(".stacks-boot-wait-dot {")).toContain(
      "stacks-boot-wait-dot 1.08s",
    );
  });

  it("progressively adds room dust by day and brighter motes at night", () => {
    expect(component).toContain('data-boot-mote="dust"');
    expect(component).not.toContain("BootButterfly");
    expect(component).not.toContain("data-boot-lamp-light");
    expect(rule(".stacks-boot-mote {")).toContain(
      "--stacks-boot-mote-size: 6px",
    );
    expect(rule(".stacks-boot-mote {")).toContain(
      "var(--stacks-boot-dust) 0 16%",
    );
    expect(rule(".dark .stacks-boot-mote {")).toContain(
      "--stacks-boot-mote-size: 7px",
    );
    expect(rule(".stacks-boot-mote-slot[data-boot-active] {")).toContain(
      "stacks-boot-mote-arrive 1.5s",
    );
    expect(component).toContain("BOOT_DUST_SPAWN_WINDOW_MS");
    expect(component).toContain("BOOT_DUST_SPAWN_DELAY_MS.minimum");
    expect(component).toContain("replace(replacementIndex)");
  });

  it("reduces the delayed state to static Loading copy", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.stacks-boot-wait \{[\s\S]*stacks-boot-wait-reduced 1ms step-end 3s forwards/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.stacks-boot-wait-notes,[\s\S]*\.stacks-boot-motes \{[\s\S]*display: none/,
    );
  });
});
