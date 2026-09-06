// The canonical rest pose for every About landmark that also appears in the
// loading vignette. This module is deliberately data-only: UnitAbout renders
// these values in WebGL, while the offline boot generator projects the same
// values into SVG. A pose edit therefore has one author and one freshness
// check instead of a JSX literal plus a hand-maintained loading approximation.
import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  VISION_PRO_MODEL_SCALE,
  VISION_PRO_MODEL_URL,
  VISION_PRO_POSE,
} from "./visionProGeometry";

export type AboutEuler = readonly [number, number, number];

export type AboutModelPose = Readonly<{
  source: `/models/${string}.glb`;
  base?: readonly [number, number, number];
  /** Translation inside the landmark carrier, after scale and rotation. */
  localPosition?: readonly [number, number, number];
  rotation: AboutEuler;
  scale: number;
}>;

export const ABOUT_AWARD_SIZE_INCREASE = 1.1;
/** Scale of the lower shelf's awards. Kept here, three-free, because the
 * boot screen's shelf layout derives its award footprint from it: taking it
 * from the lamp pose module dragged three into the homepage's first route
 * load and failed the route budget on PR #45's deploy. */
export const ABOUT_LOWER_AWARD_SCALE = 1.32 * ABOUT_AWARD_SIZE_INCREASE;
export const ABOUT_AIC_ORB_SIZE_INCREASE = 1.2;
export const ABOUT_CACTUS_SIZE_REDUCTION = 0.7;

export const ABOUT_LANDMARK_X = {
  globe: -1.16,
  succulent: -0.81,
  portrait: -0.22,
  "family-frame": 0.48,
  cactus: 0.686,
  "collective-frame": 0.785,
  "profile-frame": 1.032,
  "large-plant": 1.18,
  "desk-lamp": -1.186,
  "ai-collective": -0.8475,
  "coordination-globe": -0.5004,
  "tj-medallion": -0.1828,
  "vision-pro": 0.1527,
  "role-icons": 0.5233,
  "reading-stack": 1.0005,
} as const;

/** Owner-authored lower-shelf depth, recovered from the layout-editor draft.
 * X remains in ABOUT_LANDMARK_X because the boot elevation and spacing audit
 * share it. Depth only affects the live scene. */
export const ABOUT_LOWER_LANDMARK_Z = {
  "desk-lamp": -0.06,
  "ai-collective": -0.1147,
  "coordination-globe": -0.0795,
  "tj-medallion": -0.045,
  "vision-pro": -0.0938,
  "role-icons": -0.0283,
  "reading-stack": -0.0231,
} as const;

export const ABOUT_MODEL_POSES = {
  globe: {
    source: "/models/globe.glb",
    rotation: [0, -0.7, 0],
    scale: 1.75,
  },
  succulent: {
    source: "/models/succulent-pot.glb",
    rotation: [0, -0.4, 0],
    scale: 0.18,
  },
  cactus: {
    source: "/models/cactus.glb",
    rotation: [0, -0.35, 0],
    scale: 0.34 * ABOUT_CACTUS_SIZE_REDUCTION,
  },
  "large-plant": {
    source: "/models/potted-plant.glb",
    rotation: [0, 0.5, 0],
    scale: 1.05,
  },
  "desk-lamp": {
    source: "/models/desk-lamp.glb",
    rotation: [0, 0.78, 0],
    scale: 1.5,
  },
  "vision-pro": {
    source: VISION_PRO_MODEL_URL,
    localPosition: [0, VISION_PRO_POSE.seat, 0],
    rotation: VISION_PRO_POSE.rotation,
    scale: VISION_PRO_MODEL_SCALE,
  },
  dumbbell: {
    source: "/models/dumbbell.glb",
    base: [1.05, SHELF_GEOMETRY.groundY, 0.62],
    rotation: [0, -0.42, 0],
    scale: 1.5,
  },
} as const satisfies Record<string, AboutModelPose>;

export type AboutModelPoseId = keyof typeof ABOUT_MODEL_POSES;

export const ABOUT_PHOTO_POSES = {
  portrait: {
    baseZ: 0,
    seat: 0,
    rotation: [0, -0.125, 0],
    scale: 0.78,
  },
  family: {
    baseZ: 0,
    // The seat is derived from the frame height at the call site.
    rotation: [-0.172, -0.251, -0.102],
    scale: 1,
  },
  profile: {
    baseZ: -0.045,
    rotation: [-Math.PI / 6, -0.08, 0],
    scale: 1,
  },
} as const;

/** Camera depth for every top-shelf landmark represented during boot. SVG
 * uses the same values as its painter order because it has no depth buffer. */
export const ABOUT_TOP_LANDMARK_Z = {
  globe: 0.02,
  succulent: -0.1,
  portrait: ABOUT_PHOTO_POSES.portrait.baseZ,
  "family-frame": ABOUT_PHOTO_POSES.family.baseZ,
  cactus: -0.122,
  "collective-frame": 0.255,
  "profile-frame": ABOUT_PHOTO_POSES.profile.baseZ,
  "large-plant": -0.23,
} as const;

// The editor's outer yaw is folded into the mark's existing root yaw.
// One rotation now drives its mesh, boot projection, collider, and highlight.
export const ABOUT_AIC_ROOT_YAW = -0.1814;
export const ABOUT_AIC_MARK_YAW = 0.04;
export const ABOUT_APPLE_ROOT_YAW = -0.34;
export const ABOUT_APPLE_MARK_YAW = 0.04;

/** Canonical input to generated-projection freshness checks. */
export function aboutScenePoseSignature(): string {
  return JSON.stringify({
    version: 2,
    models: ABOUT_MODEL_POSES,
    landmarkX: ABOUT_LANDMARK_X,
    lowerLandmarkZ: ABOUT_LOWER_LANDMARK_Z,
    photos: ABOUT_PHOTO_POSES,
    topLandmarkZ: ABOUT_TOP_LANDMARK_Z,
    awards: {
      aicRootYaw: ABOUT_AIC_ROOT_YAW,
      aicMarkYaw: ABOUT_AIC_MARK_YAW,
    },
  });
}
