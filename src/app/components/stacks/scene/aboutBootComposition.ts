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
    sceneScale: 1.75,
  },
  {
    id: "portrait",
    shelf: "top",
    x: -0.42,
    glyph: "portrait-frame",
    profile: { width: 0.8, height: 0.97 },
    sceneScale: 0.78,
  },
  {
    id: "family-frame",
    shelf: "top",
    x: 0.48,
    glyph: "portrait-frame",
    profile: { width: 0.25, height: 0.31 },
  },
  {
    id: "succulent",
    shelf: "top",
    x: 0.72,
    glyph: "succulent",
    profile: { width: 0.27, height: 0.13 },
    sceneScale: 0.18,
  },
  {
    id: "profile-frame",
    shelf: "top",
    x: 1,
    glyph: "portrait-frame",
    profile: { width: 0.19, height: 0.25 },
  },
  {
    id: "large-plant",
    shelf: "top",
    x: 1.18,
    glyph: "plant",
    profile: { width: 0.27, height: 0.3 },
    sceneScale: 1.05,
  },
  {
    id: "cactus",
    shelf: "lower",
    x: -1.12,
    glyph: "cactus",
    profile: { width: 0.4, height: 0.35 },
    sceneScale: 0.34,
  },
  {
    id: "desk-lamp",
    shelf: "lower",
    x: -0.72,
    glyph: "desk-lamp",
    profile: { width: 0.28, height: 0.63 },
    sceneScale: 1.5,
  },
  {
    id: "ai-collective",
    shelf: "lower",
    x: -0.48,
    glyph: "collective-mark",
    profile: { width: 0.21, height: 0.24 },
  },
  {
    id: "tj-medallion",
    shelf: "lower",
    x: -0.24,
    glyph: "medallion",
    profile: { width: 0.22, height: 0.26 },
    sceneScale: 0.72,
  },
  {
    id: "apple",
    shelf: "lower",
    x: 0,
    glyph: "apple",
    profile: { width: 0.16, height: 0.17 },
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
    profile: { width: 0.33, height: 0.21 },
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
