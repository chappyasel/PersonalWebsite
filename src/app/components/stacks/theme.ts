// Visual constants for The Stacks — theme palettes, film grain, and the
// deterministic pseudo-random used to keep shelf packing stable across renders.
// Shared by scene (WebGL) and DOM layers; keep this module dependency-free.

// Sky/fog hexes are authored against the CORRECTED shader pipeline (the dome
// tonemaps + encodes like every lit material). Fog must sit on the sky's
// eye-level horizon band or a value seam appears where far geometry meets sky.
// v4 theme repair (audit §2.3): light collapses VALUE (wood −8% against
// paper props, sky deepened a step, skyline given real presence, frame rail
// contrast restored); dark collapses ALBEDO (spine/pile/cover chroma widened
// so rust/olive/terracotta survive the warm key).
export const PALETTES = {
  light: {
    skyTop: "#d3e0ec",
    skyHorizon: "#e3dcc9",
    skyShadow: "#d4d7d3",
    skyEmber: "#ffd9a0",
    skyline: "#a7b1bf",
    skyWindow: "#ffca8a",
    fog: "#ded8c8",
    wood: "#a5845f",
    woodDark: "#8a6b4c",
    strap: "#826645",
    frame: "#e6d9c0",
    cover: "#dccdb4",
    pages: "#f4ecdb",
    plate: "#6b5a47",
    hub: "#443a2d",
    metal: "#7d6a52",
    paper: "#f6efdf",
    ink: "#6e5d49",
    spines: [
      "#a5764c", "#8d7355", "#c2a377", "#9c4f38", "#6e5d49",
      "#b8926a", "#84573f", "#5c5648", "#6e7f95", "#a4917a",
    ],
    pile: ["#8a5a3c", "#5c5648", "#9c6b4f"],
    shadow: "#5a4326",
    dust: "#c9a97e",
    dustOpacity: 0.3,
    glowOpacity: 0.22,
  },
  dark: {
    skyTop: "#101623",
    skyHorizon: "#3a4457",
    skyShadow: "#1a2230",
    skyEmber: "#d97b41",
    skyline: "#131a26",
    skyWindow: "#ffbe73",
    fog: "#28303f",
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
      "#8f4a2c", "#94795a", "#5f6134", "#a86c46", "#463a2b",
      "#7a6650", "#6d3f28", "#42506e", "#75604a", "#57493a",
    ],
    pile: ["#8a4a30", "#59602f", "#9c7857"],
    shadow: "#0e0a06",
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
