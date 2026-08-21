import {
  ABOUT_AIC_BASE_WIDTH,
  ABOUT_APPLE_BASE_WIDTH,
} from "./aboutAwardGeometry";
import {
  COORDINATION_GLOBE_PROFILE_HEIGHT,
  COORDINATION_GLOBE_PROFILE_WIDTH,
} from "./coordinationGlobeGeometry";
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
  | "coordination-globe"
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
  /** False for a live landmark whose camera projection is not a useful boot
   * silhouette, such as a print lying almost flat on the shelf. */
  bootVisible?: boolean;
};

/** Owner-requested increase from the reviewed lower-award composition. */
export const ABOUT_AWARD_SIZE_INCREASE = 1.1;
/** Additional owner-requested increase for the AIC mark and orb only. */
export const ABOUT_AIC_ORB_SIZE_INCREASE = 1.2;
/** Owner-requested reduction to open space beside the lower-shelf lamp. */
export const ABOUT_CACTUS_SIZE_REDUCTION = 0.7;

/** Every live About landmark, in shelf order. BootScreen filters the few
 * objects whose front projection would be misleading. */
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
    x: -0.22,
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
    id: "collective-frame",
    shelf: "top",
    x: 0.5,
    glyph: "landscape-frame",
    // The live frame lies almost face-up. This is its shallow front
    // projection, not the standing height it used on the lower shelf.
    profile: { width: 0.3352, height: 0.052 },
    imageProfile: { width: 0.3072, height: 0.024 },
    bootVisible: false,
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
    x: -1.16,
    glyph: "cactus",
    profile: {
      width: 0.4 * ABOUT_CACTUS_SIZE_REDUCTION,
      height: 0.35 * ABOUT_CACTUS_SIZE_REDUCTION,
    },
    colorProfile: { light: "#7a8f56", dark: "#6d7c42" },
    sceneScale: 0.34 * ABOUT_CACTUS_SIZE_REDUCTION,
  },
  {
    id: "desk-lamp",
    shelf: "lower",
    x: -0.87,
    glyph: "desk-lamp",
    profile: { width: 0.28, height: 0.63 },
    colorProfile: { light: "#c2a377", dark: "#94795a" },
    sceneScale: 1.5,
  },
  {
    id: "ai-collective",
    shelf: "lower",
    x: -0.53,
    glyph: "collective-mark",
    profile: {
      width:
        ABOUT_AIC_BASE_WIDTH *
        1.32 *
        ABOUT_AWARD_SIZE_INCREASE *
        ABOUT_AIC_ORB_SIZE_INCREASE,
      height:
        0.208 * 1.32 * ABOUT_AWARD_SIZE_INCREASE * ABOUT_AIC_ORB_SIZE_INCREASE,
    },
    colorProfile: { light: "#ff9b50", dark: "#d77332" },
  },
  {
    id: "coordination-globe",
    shelf: "lower",
    x: -0.139,
    glyph: "coordination-globe",
    profile: {
      width:
        COORDINATION_GLOBE_PROFILE_WIDTH *
        1.386 *
        ABOUT_AWARD_SIZE_INCREASE *
        ABOUT_AIC_ORB_SIZE_INCREASE,
      height:
        COORDINATION_GLOBE_PROFILE_HEIGHT *
        1.386 *
        ABOUT_AWARD_SIZE_INCREASE *
        ABOUT_AIC_ORB_SIZE_INCREASE,
    },
    colorProfile: { light: "#05070a", dark: "#010205" },
  },
  {
    id: "tj-medallion",
    shelf: "lower",
    x: 0.183,
    glyph: "medallion",
    profile: {
      width: 0.3 * 0.66 * ABOUT_AWARD_SIZE_INCREASE,
      height: 0.352 * 0.66 * ABOUT_AWARD_SIZE_INCREASE,
    },
    colorProfile: { light: "#b9ad98", dark: "#7d7468" },
    sceneScale: 0.66 * ABOUT_AWARD_SIZE_INCREASE,
  },
  {
    id: "apple",
    shelf: "lower",
    x: 0.424,
    glyph: "apple",
    profile: {
      width: ABOUT_APPLE_BASE_WIDTH * 1.32 * ABOUT_AWARD_SIZE_INCREASE,
      height: 0.176 * 1.32 * ABOUT_AWARD_SIZE_INCREASE,
    },
    colorProfile: { light: "#c2c6ca", dark: "#9ba2a7" },
  },
  {
    id: "reading-stack",
    shelf: "lower",
    x: 0.955,
    glyph: "reading-stack",
    profile: { width: 0.72, height: 0.5 },
  },
] as const satisfies readonly AboutBootLandmark[];

export const ABOUT_BOOT_VISIBLE_COMPOSITION = ABOUT_BOOT_COMPOSITION.filter(
  (landmark) => !("bootVisible" in landmark) || landmark.bootVisible !== false,
);

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
