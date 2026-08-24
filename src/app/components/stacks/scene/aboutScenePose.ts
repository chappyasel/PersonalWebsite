// The canonical rest pose for every About landmark that also appears in the
// loading vignette. This module is deliberately data-only: UnitAbout renders
// these values in WebGL, while the offline boot generator projects the same
// values into SVG. A pose edit therefore has one author and one freshness
// check instead of a JSX literal plus a hand-maintained loading approximation.
import { SHELF_GEOMETRY } from "./shelfGeometry";

export type AboutEuler = readonly [number, number, number];

export type AboutModelPose = Readonly<{
  source: `/models/${string}.glb`;
  base?: readonly [number, number, number];
  rotation: AboutEuler;
  scale: number;
}>;

export const ABOUT_AWARD_SIZE_INCREASE = 1.1;
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
  "desk-lamp": -1.16,
  "ai-collective": -0.82,
  "coordination-globe": -0.429,
  "tj-medallion": -0.107,
  apple: 0.134,
  "role-icons": 0.439,
  "reading-stack": 0.985,
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

export const ABOUT_AIC_ROOT_YAW = -0.16;
export const ABOUT_AIC_MARK_YAW = 0.04;
export const ABOUT_APPLE_ROOT_YAW = -0.34;
export const ABOUT_APPLE_MARK_YAW = 0.04;

/** Canonical input to generated-projection freshness checks. */
export function aboutScenePoseSignature(): string {
  return JSON.stringify({
    version: 1,
    models: ABOUT_MODEL_POSES,
    landmarkX: ABOUT_LANDMARK_X,
    photos: ABOUT_PHOTO_POSES,
    topLandmarkZ: ABOUT_TOP_LANDMARK_Z,
    awards: {
      aicRootYaw: ABOUT_AIC_ROOT_YAW,
      aicMarkYaw: ABOUT_AIC_MARK_YAW,
      appleRootYaw: ABOUT_APPLE_ROOT_YAW,
      appleMarkYaw: ABOUT_APPLE_MARK_YAW,
    },
  });
}
