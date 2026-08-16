// Visual constants for the homepage 3D scene — theme palettes, film grain, and the
// deterministic pseudo-random used to keep shelf packing stable across renders.
// Shared by scene (WebGL) and DOM layers; keep this module dependency-free.

// Sky/fog hexes are authored against the CORRECTED shader pipeline (the dome
// tonemaps + encodes like every lit material). Fog must sit on the sky's
// eye-level horizon band or a value seam appears where far geometry meets sky.
// v4 theme repair (audit §2.3): light collapses VALUE (wood −8% against
// paper props, sky deepened a step, skyline given real presence, frame rail
// contrast restored); dark collapses ALBEDO (spine/pile/cover chroma widened
// so rust/olive/terracotta survive the warm key).
//
// v5 sky retune. The whole visible sky lives in elevation 0…0.20 — the dome's
// zenith hex barely reaches the frame — so the on-screen colour is decided by
// skyHorizon and skyShadow, not skyTop. The old light triplet was authored
// bright (all three near sRGB 210+), where ACES flattens chroma roughly 3:1:
// #e3dcc9 printed [221,219,212] and #d4d7d3 printed [216,217,215], i.e. one
// undifferentiated grey-beige wall. The light hexes are now authored a step
// DEEPER, which is where ACES still carries colour, so the frame gets a real
// vertical arc: clear morning blue overhead → a softer blue horizon → pale
// blue haze at eye level. Dark keeps its luminance envelope and buys richness in
// chroma instead. Effects.tsx rebuilds the rest of the chroma post-ACES;
// touch devices have no composer, so these hexes must read on their own.
export const PALETTES = {
  light: {
    // The meadow reference's clear pastoral morning: a saturated blue upper
    // vault fading to a lower band with about half the top's blue contrast.
    // Keeping every stop in the same blue family prevents the eye-level sky
    // and matching fog from resolving to grey. These are deliberately more
    // chromatic than their intended screen colours because
    // ACES compresses the dome before display. SceneEnvironment also brings
    // the blue cap into the camera's shallow visible elevation range; without
    // that, even a blue `skyTop` contributes too little to escape grey.
    // More saturated than the first pastoral pass: the dome is ACES-tonemapped
    // and the visible camera band samples only part of this cap.
    skyTop: "#126bb0",
    skyHorizon: "#4f8ab3",
    skyShadow: "#6a9aba",
    skyEmber: "#f5c78d",
    // The seated Washington vista owns a distinct east-facing daylight vault.
    // These stay in sRGB here and are linearized with the other sky uniforms.
    dcSkyTop: "#397fb8",
    dcSkyHorizon: "#78afd4",
    dcSkyShadow: "#5f95bd",
    dcWater: "#3f789f",
    // Distant blue-grey, but materially darker than the eye-level air. The
    // old #8297ac had the same relative luminance as skyShadow, so atmospheric
    // blending erased the buildings instead of merely softening them.
    skyline: "#5b7288",
    skyWindow: "#ffca8a",
    // Far geometry meets the pale blue eye-level band, not the full blue cap.
    fog: "#6a9aba",
    meadowBase: "#273216",
    meadowTipA: "#7ca971",
    meadowTipB: "#25422c",
    wood: "#a5845f",
    woodDark: "#8a6746",
    strap: "#836441",
    frame: "#e6d9c0",
    cover: "#dccdb4",
    pages: "#f4ecdb",
    plate: "#6d5943",
    hub: "#463a29",
    metal: "#7d6a52",
    paper: "#f6efdf",
    ink: "#6f5c45",
    spines: [
      "#a5764c",
      "#8d7355",
      "#c2a377",
      "#9c4f38",
      "#6e5d49",
      "#b8926a",
      "#84573f",
      "#5c5648",
      "#6e7f95",
      "#a4917a",
    ],
    pile: ["#8a5a3c", "#5c5648", "#9c6b4f"],
    shadow: "#5c4324",
    // Saturated amber core for light-mode fireflies. SceneEnvironment adds a
    // separate larger gold halo; keeping the core darker is what preserves
    // contrast over the near-white sky instead of merely brightening it.
    dust: "#b76a0b",
    dustOpacity: 0.78,
    glowOpacity: 0.22,
  },
  dark: {
    skyTop: "#1e2842",
    skyHorizon: "#3a4762",
    skyShadow: "#1b2233",
    skyEmber: "#e07c3e",
    dcSkyTop: "#1e2842",
    dcSkyHorizon: "#3a4762",
    dcSkyShadow: "#1b2233",
    dcWater: "#17233a",
    skyline: "#141b2b",
    skyWindow: "#ffbe73",
    fog: "#253045",
    meadowBase: "#0d1710",
    meadowTipA: "#3f5a49",
    meadowTipB: "#1d2c25",
    wood: "#5c4832",
    woodDark: "#453521",
    strap: "#3b2e1f",
    frame: "#2e261c",
    cover: "#3a2f21",
    pages: "#b3a68f",
    plate: "#57493a",
    hub: "#241d14",
    metal: "#6b5a47",
    paper: "#c9bda4",
    ink: "#3b2e1f",
    spines: [
      "#8f4a2c",
      "#94795a",
      "#5f6134",
      "#a86c46",
      "#463a2b",
      "#7a6650",
      "#6d3f28",
      "#42506e",
      "#75604a",
      "#57493a",
    ],
    pile: ["#8a4a30", "#59602f", "#9c7857"],
    shadow: "#0b0a10",
    dust: "#ffcf9e",
    dustOpacity: 0.45,
    glowOpacity: 0.55,
  },
} as const;

export type Palette = (typeof PALETTES)["light" | "dark"];

// feTurbulence emits 4-channel noise with a random alpha; the feColorMatrix
// copies one channel to RGB and forces alpha to 1 so the grain is mono and
// opaque — without it the overlay's effective opacity halves and the noise
// reads as color confetti.
export const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Route remote cover art through the Next image optimizer at a fixed width. */
export function proxied(url: string, w: 48 | 256 | 384 = 384): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}

/** Deterministic hash noise — stable shelf packing without Math.random. */
export function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
