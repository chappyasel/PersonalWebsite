// Visual constants for The Stacks — theme palettes, film grain, and the
// deterministic pseudo-random used to keep shelf packing stable across renders.
// Shared by scene (WebGL) and DOM layers; keep this module dependency-free.

// Sky/fog hexes are authored against the CORRECTED shader pipeline (the dome
// tonemaps + encodes like every lit material). Fog must sit on the sky's
// eye-level horizon band or a value seam appears where far geometry meets sky.
export const PALETTES = {
  light: {
    skyTop: "#dfe9f2",
    skyHorizon: "#f0e4d2",
    fog: "#ece5d9",
    wood: "#b3906a",
    woodDark: "#967553",
    strap: "#8f7150",
    frame: "#f4ebdc",
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
    glowOpacity: 0.22,
  },
  dark: {
    skyTop: "#101623",
    skyHorizon: "#3a4457",
    fog: "#313a4c",
    wood: "#5c4832",
    woodDark: "#453521",
    strap: "#3b2e1f",
    frame: "#2e261c",
    cover: "#2c241b",
    pages: "#b3a68f",
    plate: "#57493a",
    hub: "#241d14",
    metal: "#6b5a47",
    paper: "#c9bda4",
    ink: "#3b2e1f",
    spines: [
      "#7a4a2f", "#8a7358", "#5c5b3a", "#9c6b4f", "#4e4234",
      "#75634e", "#63412f", "#3f4a5c", "#6d5a44", "#54483b",
    ],
    pile: ["#7a5a3e", "#4e4234", "#8a7358"],
    shadow: "#0e0a06",
    dust: "#ffcf9e",
    glowOpacity: 0.55,
  },
} as const;

export type Palette = (typeof PALETTES)["light" | "dark"];

export const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Route remote cover art through the Next image optimizer at a fixed width. */
export function proxied(url: string, w: 48 | 256 | 384 = 384): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}

/** Deterministic hash noise — stable shelf packing without Math.random. */
export function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
