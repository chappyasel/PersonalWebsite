import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { BOOT_WAIT_NOTE_FADE_MS } from "./bootVignette";

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
  // React Fast Refresh only treats a module as a refresh boundary when every
  // one of its exports is a component. A single exported constant here turns
  // every saved edit into a full document reload, which tears down the live
  // world and replays the entire boot behind the screen being tuned. The
  // vignette's maths live in ./bootVignette for exactly this reason.
  it("exports nothing but components, so a saved edit hot-swaps", () => {
    const exported = Array.from(
      component.matchAll(/^export (?:default )?(?:async )?(\w+) (\w+)/gm),
    ).map(([, kind, name]) => ({ kind, name: name ?? "" }));

    expect(exported.length).toBeGreaterThan(0);
    for (const { kind, name } of exported) {
      // Types are erased before the refresh boundary is decided.
      if (kind === "type" || kind === "interface") continue;
      expect(kind, `${name} is not a component declaration`).toBe("function");
      expect(name.slice(0, 1), `${name} is not a component name`).toBe(
        name.slice(0, 1).toUpperCase(),
      );
    }
  });

  // A boot screen returning after a reveal (SPA re-entry, or a dev remount)
  // must become visible on the same frame the handshake asks for it. The flat
  // document is hidden the instant `data-world` is set and the world's canvas
  // has just been torn down, so any delay on the way back to visible is a
  // window with nothing on screen at all.
  it("delays the boot screen's visibility only while it is leaving", () => {
    expect(rule(".stacks-boot {")).toContain("visibility 0s;");
    expect(rule('html[data-world="ready"] .stacks-boot {')).toContain(
      "visibility 0s linear 360ms",
    );
  });

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
    expect(component.match(/rel="preload"/g)).toHaveLength(1);
    expect(component).toContain("data-boot-reading-cover-preload");
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

  it("keeps the Vision Pro glass edge subordinate to its face", () => {
    const glass = rule(".stacks-boot-vision-glass {");

    expect(glass).toContain("stroke-width: 0.45");
    expect(glass).toContain(
      "stroke: color-mix(in srgb, var(--stacks-boot-object) 68%, #d8ecff)",
    );
  });

  it("uses theme-specific tones for the Vision Pro strap and enclosure", () => {
    expect(rule(".stacks-boot-vision-band {")).toContain("fill: #8c9499");
    expect(rule(".dark .stacks-boot-vision-band {")).toContain("fill: #434a50");
    expect(rule(".stacks-boot-vision-enclosure {")).toContain("fill: #929ba1");
    expect(rule(".dark .stacks-boot-vision-enclosure {")).toContain(
      "fill: #60686e",
    );
  });

  it("paints a directional highlight across the AIC mark", () => {
    expect(
      rule(
        '.stacks-boot-model-silhouette[data-model-silhouette="ai-collective"] {',
      ),
    ).toContain('fill: url("#stacks-boot-aic-shine")');
    expect(rule(".stacks-boot-shine-highlight {")).toContain(
      "var(--stacks-boot-object) 38%, white",
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

  it("shows the loading copy from first paint", () => {
    const wait = rule(".stacks-boot-wait {");

    expect(wait).toContain("opacity: 1");
    expect(wait).not.toContain("animation:");
    expect(css).not.toContain("@keyframes stacks-boot-wait-arrive");
    // The notes cross-fade between machine states. Nothing about them runs on
    // a timer, so there is no carousel keyframe and no cycle variable: a
    // twenty-second loop is what made them fiction in the first place.
    expect(css).not.toContain("@keyframes stacks-boot-wait-note");
    expect(css).not.toContain("--stacks-boot-wait-cycle");
    expect(css).not.toContain("--stacks-boot-wait-delay");
    expect(rule(".stacks-boot-wait-note {")).toContain(
      `opacity ${BOOT_WAIT_NOTE_FADE_MS}ms ease`,
    );
    expect(rule('.stacks-boot-wait-note[data-boot-note="active"] {')).toContain(
      "opacity: 1",
    );
    expect(component).toContain("createBootDustDrift(");
    expect(component).toContain("iterations: Number.POSITIVE_INFINITY");
    expect(css).not.toContain("@keyframes stacks-boot-firefly-wander");
    expect(rule(".stacks-boot-motes {")).toContain(
      "stacks-boot-motes-arrive 3s ease-out 2s forwards",
    );
  });

  it("gives the 3D loading label more weight than the supporting notes", () => {
    const label = rule(".stacks-boot-wait-label {");

    expect(component).toContain("Loading the 3D room");
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

  it("keeps the immediate loading copy static under reduced motion", () => {
    expect(css).not.toContain("stacks-boot-wait-reduced");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.stacks-boot-wait-notes,[\s\S]*\.stacks-boot-motes \{[\s\S]*display: none/,
    );
  });
});
