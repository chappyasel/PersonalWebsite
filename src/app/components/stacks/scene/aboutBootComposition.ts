import {
  ABOUT_AIC_BASE_DEPTH,
  ABOUT_AIC_BASE_WIDTH,
  ABOUT_AIC_MARK_DEPTH,
  ABOUT_AIC_MARK_WIDTH,
} from "./aboutAwardGeometry";
import { ABOUT_BOOT_MODEL_SILHOUETTES } from "./aboutBootSilhouettes";
import {
  ABOUT_ROLE_STACK_HEIGHT,
  ABOUT_ROLE_STACK_PROFILE_WIDTH,
} from "./aboutRoleIcons";
import {
  ABOUT_AIC_MARK_YAW,
  ABOUT_AIC_ORB_SIZE_INCREASE,
  ABOUT_AIC_ROOT_YAW,
  ABOUT_AWARD_SIZE_INCREASE,
  ABOUT_LANDMARK_X,
  ABOUT_MODEL_POSES,
  ABOUT_PHOTO_POSES,
  ABOUT_TOP_LANDMARK_Z,
} from "./aboutScenePose";
import {
  COORDINATION_GLOBE_PROFILE_HEIGHT,
  COORDINATION_GLOBE_PROFILE_WIDTH,
} from "./coordinationGlobeGeometry";
import { PORTRAIT_FRAME_SIZE, PORTRAIT_IMAGE } from "./portraitFrameGeometry";
import type { ShelfPlankId } from "./shelfGeometry";
import { TJ_MEDALLION_POSE } from "./tjMedallionGeometry";
import {
  ABOUT_READING_BOOK,
  ABOUT_READING_STACK_PROFILE_WIDTH,
} from "./units/aboutReadingStack";

export {
  ABOUT_AIC_ORB_SIZE_INCREASE,
  ABOUT_AWARD_SIZE_INCREASE,
  ABOUT_CACTUS_SIZE_REDUCTION,
} from "./aboutScenePose";

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
  | "vision-pro"
  | "role-icons"
  | "reading-stack";

export function aboutProjectedBoxWidth(
  width: number,
  depth: number,
  yaw: number,
) {
  return Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * depth;
}

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

/** Every live About landmark, in shelf order. BootScreen filters the few
 * objects whose front projection would be misleading. */
export const ABOUT_BOOT_COMPOSITION = [
  {
    id: "globe",
    shelf: "top",
    x: ABOUT_LANDMARK_X.globe,
    glyph: "globe",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES.globe.profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES.globe.profile[1],
    },
    colorProfile: { light: "#5c7f9c", dark: "#3c5a72" },
    sceneScale: ABOUT_MODEL_POSES.globe.scale,
  },
  {
    // Moved up from the lower shelf's left end when the Role Icons arrived:
    // it is Set Dressing, and the span between the globe and the portrait was
    // the one stretch of plank in the unit with nothing on it.
    id: "succulent",
    shelf: "top",
    x: ABOUT_LANDMARK_X.succulent,
    glyph: "succulent",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES.succulent.profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES.succulent.profile[1],
    },
    colorProfile: { light: "#5f7a48", dark: "#5a6a38" },
    sceneScale: ABOUT_MODEL_POSES.succulent.scale,
  },
  {
    id: "portrait",
    shelf: "top",
    x: ABOUT_LANDMARK_X.portrait,
    glyph: "portrait-frame",
    // The live PortraitFrame's own geometry at its scene scale.
    profile: {
      width: PORTRAIT_FRAME_SIZE.width * ABOUT_PHOTO_POSES.portrait.scale,
      height: PORTRAIT_FRAME_SIZE.height * ABOUT_PHOTO_POSES.portrait.scale,
    },
    imageProfile: {
      width: PORTRAIT_IMAGE.width * ABOUT_PHOTO_POSES.portrait.scale,
      height: PORTRAIT_IMAGE.height * ABOUT_PHOTO_POSES.portrait.scale,
    },
    sceneScale: ABOUT_PHOTO_POSES.portrait.scale,
  },
  {
    id: "family-frame",
    shelf: "top",
    x: ABOUT_LANDMARK_X["family-frame"],
    glyph: "portrait-frame",
    profile: { width: 0.264 * (769 / 1024) + 0.048, height: 0.312 },
    imageProfile: { width: 0.264 * (769 / 1024), height: 0.264 },
  },
  {
    id: "cactus",
    shelf: "top",
    // Owner placement via the scene layout editor, 2026-08-22. It stands
    // behind the family frame's plane, so their front elevations overlap a
    // little without the objects meeting in 3D.
    x: ABOUT_LANDMARK_X.cactus,
    glyph: "cactus",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES.cactus.profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES.cactus.profile[1],
    },
    colorProfile: { light: "#7a8f56", dark: "#6d7c42" },
    sceneScale: ABOUT_MODEL_POSES.cactus.scale,
  },
  {
    id: "collective-frame",
    shelf: "top",
    // Owner placement via the scene layout editor, 2026-08-22: lying flat at
    // the plank's front edge, right of the cactus.
    x: ABOUT_LANDMARK_X["collective-frame"],
    glyph: "landscape-frame",
    // The live frame lies almost face-up. This is its shallow front
    // projection, not the standing height it used on the lower shelf.
    profile: { width: 0.3352, height: 0.052 },
    imageProfile: { width: 0.3072, height: 0.024 },
    bootVisible: false,
  },
  {
    id: "profile-frame",
    shelf: "top",
    // Owner placement via the scene layout editor, 2026-08-22.
    x: ABOUT_LANDMARK_X["profile-frame"],
    glyph: "portrait-frame",
    profile: { width: 0.228, height: 0.288 },
    imageProfile: { width: 0.18, height: 0.24 },
  },
  {
    id: "large-plant",
    shelf: "top",
    x: ABOUT_LANDMARK_X["large-plant"],
    glyph: "plant",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES["large-plant"].profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES["large-plant"].profile[1],
    },
    colorProfile: { light: "#5f7a48", dark: "#5a6a38" },
    sceneScale: ABOUT_MODEL_POSES["large-plant"].scale,
  },
  // The lower row is packed around a physically scaled Vision Pro, which now
  // occupies the former Apple-mark slot between TJ and the Role Icons.
  {
    id: "desk-lamp",
    shelf: "lower",
    x: ABOUT_LANDMARK_X["desk-lamp"],
    glyph: "desk-lamp",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES["desk-lamp"].profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES["desk-lamp"].profile[1],
    },
    colorProfile: { light: "#c2a377", dark: "#94795a" },
    sceneScale: ABOUT_MODEL_POSES["desk-lamp"].scale,
  },
  {
    id: "ai-collective",
    shelf: "lower",
    x: ABOUT_LANDMARK_X["ai-collective"],
    glyph: "collective-mark",
    profile: {
      width:
        Math.max(
          aboutProjectedBoxWidth(
            ABOUT_AIC_BASE_WIDTH,
            ABOUT_AIC_BASE_DEPTH,
            ABOUT_AIC_ROOT_YAW,
          ),
          aboutProjectedBoxWidth(
            ABOUT_AIC_MARK_WIDTH,
            ABOUT_AIC_MARK_DEPTH,
            ABOUT_AIC_ROOT_YAW + ABOUT_AIC_MARK_YAW,
          ),
        ) *
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
    x: ABOUT_LANDMARK_X["coordination-globe"],
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
    x: ABOUT_LANDMARK_X["tj-medallion"],
    glyph: "medallion",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].profile[1],
    },
    colorProfile: { light: "#b9ad98", dark: "#7d7468" },
    // 0.66 * ABOUT_AWARD_SIZE_INCREASE, held in the geometry specification the
    // boot silhouette is traced from so the two cannot disagree.
    sceneScale: TJ_MEDALLION_POSE.scale,
  },
  {
    id: "vision-pro",
    shelf: "lower",
    x: ABOUT_LANDMARK_X["vision-pro"],
    glyph: "vision-pro",
    profile: {
      width: ABOUT_BOOT_MODEL_SILHOUETTES["vision-pro"].profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES["vision-pro"].profile[1],
    },
    colorProfile: { light: "#b8bec2", dark: "#939ba1" },
    sceneScale: ABOUT_MODEL_POSES["vision-pro"].scale,
  },
  {
    // Four Role Icons, two by two, beside Vision Pro. The tiles carry
    // their own brand colors, so this landmark has no single colorProfile.
    id: "role-icons",
    shelf: "lower",
    x: ABOUT_LANDMARK_X["role-icons"],
    glyph: "role-icons",
    profile: {
      width: ABOUT_ROLE_STACK_PROFILE_WIDTH,
      height: ABOUT_ROLE_STACK_HEIGHT,
    },
  },
  {
    // Three equally spaced covers, tightened to the owner's edited footprint.
    id: "reading-stack",
    shelf: "lower",
    x: ABOUT_LANDMARK_X["reading-stack"],
    glyph: "reading-stack",
    profile: {
      width: ABOUT_READING_STACK_PROFILE_WIDTH,
      height: ABOUT_READING_BOOK.depth,
    },
  },
] as const satisfies readonly AboutBootLandmark[];

export const ABOUT_BOOT_VISIBLE_COMPOSITION = ABOUT_BOOT_COMPOSITION.filter(
  (landmark) => !("bootVisible" in landmark) || landmark.bootVisible !== false,
);

/** SVG has no depth buffer. Preserve the live scene's top-shelf occlusion by
 * sorting those landmarks by the same camera-depth positions WebGL uses,
 * while keeping the authored cadence slot independent from paint order. */
export const ABOUT_BOOT_PAINT_COMPOSITION = ABOUT_BOOT_VISIBLE_COMPOSITION.map(
  (landmark, cadenceSlot) => ({ landmark, cadenceSlot }),
).sort((a, b) => {
  if (a.landmark.shelf !== b.landmark.shelf) {
    return a.landmark.shelf === "top" ? -1 : 1;
  }
  if (a.landmark.shelf === "lower") {
    return a.cadenceSlot - b.cadenceSlot;
  }
  const depth = (landmark: AboutBootLandmark) =>
    ABOUT_TOP_LANDMARK_Z[landmark.id as keyof typeof ABOUT_TOP_LANDMARK_Z] ?? 0;
  return depth(a.landmark) - depth(b.landmark);
});

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
