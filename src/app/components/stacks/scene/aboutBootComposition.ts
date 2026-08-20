import type { ShelfPlankId } from "./shelfGeometry";

export const ABOUT_LANDMARK_NODE_PREFIX = "stacks-about-landmark:";

export type AboutLandmarkGlyph =
  | "globe"
  | "portrait-frame"
  | "landscape-frame"
  | "succulent"
  | "plant"
  | "cactus"
  | "desk-lamp"
  | "collective-mark"
  | "medallion"
  | "apple"
  | "reading-stack";

export type AboutBootLandmark = {
  id: string;
  shelf: ShelfPlankId;
  /** Unit-local scene X, shared verbatim with UnitAbout. */
  x: number;
  glyph: AboutLandmarkGlyph;
  /** Simplified front elevation, in scene units. */
  profile: { width: number; height: number };
  /** Exact visible photo plane inside a frame, in scene units. */
  imageProfile?: { width: number; height: number };
  /** Dominant front-elevation color used before the lit 3D material arrives. */
  colorProfile?: { light: string; dark: string };
  /** Model scale where the live prop has one authored at its call site. */
  sceneScale?: number;
};

/** Curated front-elevation landmarks in their explicit settle order. Face-up
 * prints are deliberately absent: they are real props, but not legible shelf
 * silhouettes from the boot vignette's viewpoint. */
export const ABOUT_BOOT_COMPOSITION = [
  {
    id: "globe",
    shelf: "top",
    x: -1.16,
    glyph: "globe",
    profile: { width: 0.32, height: 0.49 },
    colorProfile: { light: "#5c7f9c", dark: "#3c5a72" },
    sceneScale: 1.75,
  },
  {
    id: "portrait",
    shelf: "top",
    x: -0.42,
    glyph: "portrait-frame",
    profile: { width: 1.02 * 0.78, height: 1.24 * 0.78 },
    imageProfile: { width: 0.86 * 0.78, height: 1.08 * 0.78 },
    sceneScale: 0.78,
  },
  {
    id: "family-frame",
    shelf: "top",
    x: 0.48,
    glyph: "portrait-frame",
    profile: { width: 0.264 * (769 / 1024) + 0.048, height: 0.312 },
    imageProfile: { width: 0.264 * (769 / 1024), height: 0.264 },
  },
  {
    id: "succulent",
    shelf: "top",
    x: 0.72,
    glyph: "succulent",
    profile: { width: 0.27, height: 0.13 },
    colorProfile: { light: "#5f7a48", dark: "#5a6a38" },
    sceneScale: 0.18,
  },
  {
    id: "profile-frame",
    shelf: "top",
    x: 1,
    glyph: "portrait-frame",
    profile: { width: 0.228, height: 0.288 },
    imageProfile: { width: 0.18, height: 0.24 },
  },
  {
    id: "large-plant",
    shelf: "top",
    x: 1.18,
    glyph: "plant",
    profile: { width: 0.27, height: 0.3 },
    colorProfile: { light: "#5f7a48", dark: "#5a6a38" },
    sceneScale: 1.05,
  },
  {
    id: "cactus",
    shelf: "lower",
    x: -1.12,
    glyph: "cactus",
    profile: { width: 0.4, height: 0.35 },
    colorProfile: { light: "#7a8f56", dark: "#6d7c42" },
    sceneScale: 0.34,
  },
  {
    id: "desk-lamp",
    shelf: "lower",
    x: -0.72,
    glyph: "desk-lamp",
    profile: { width: 0.28, height: 0.63 },
    colorProfile: { light: "#c2a377", dark: "#94795a" },
    sceneScale: 1.5,
  },
  {
    id: "ai-collective",
    shelf: "lower",
    x: -0.48,
    glyph: "collective-mark",
    profile: { width: 0.205, height: 0.208 },
    colorProfile: { light: "#ff9b50", dark: "#d77332" },
  },
  {
    id: "tj-medallion",
    shelf: "lower",
    x: -0.24,
    glyph: "medallion",
    profile: { width: 0.3 * 0.72, height: 0.352 * 0.72 },
    colorProfile: { light: "#b9ad98", dark: "#7d7468" },
    sceneScale: 0.72,
  },
  {
    id: "apple",
    shelf: "lower",
    x: 0,
    glyph: "apple",
    profile: { width: 0.152, height: 0.176 },
    colorProfile: { light: "#c2c6ca", dark: "#9ba2a7" },
  },
  {
    id: "reading-stack",
    shelf: "lower",
    x: 0.51,
    glyph: "reading-stack",
    profile: { width: 0.72, height: 0.5 },
  },
  {
    id: "collective-frame",
    shelf: "lower",
    x: 1.06,
    glyph: "landscape-frame",
    profile: { width: 0.3552, height: 0.24 },
    imageProfile: { width: 0.3072, height: 0.192 },
  },
] as const satisfies readonly AboutBootLandmark[];

export type AboutLandmarkId = (typeof ABOUT_BOOT_COMPOSITION)[number]["id"];

export const ABOUT_BOOT_LANDMARKS = Object.fromEntries(
  ABOUT_BOOT_COMPOSITION.map((landmark) => [landmark.id, landmark]),
) as {
  [Id in AboutLandmarkId]: Extract<
    (typeof ABOUT_BOOT_COMPOSITION)[number],
    { id: Id }
  >;
};

export function aboutLandmarkNodeName(id: AboutLandmarkId) {
  return `${ABOUT_LANDMARK_NODE_PREFIX}${id}`;
}
