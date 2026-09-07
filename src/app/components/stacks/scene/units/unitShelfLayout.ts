import {
  ABOUT_APPLE_BASE_DEPTH,
  ABOUT_APPLE_BASE_WIDTH,
} from "../aboutAwardGeometry";
import {
  ABOUT_APPLE_MARK_YAW,
  ABOUT_APPLE_ROOT_YAW,
  ABOUT_LOWER_AWARD_SCALE,
} from "../aboutScenePose";
import { deskFrameWidth } from "../photoGeometry";
import { SHELF_GEOMETRY } from "../shelfGeometry";

/** Shared floor pose so meadow coverage can follow the real Training barbell
 * instead of copying its coordinates into a second system. */
export const TRAINING_BARBELL_POSE: Readonly<{
  base: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}> = {
  base: [1.92, SHELF_GEOMETRY.groundY, -1.04],
  rotation: [0, -Math.PI / 4, 0],
  scale: 0.77,
};

export const PROJECT_PHOTO_DIMENSIONS = {
  apple: {
    width: 0.336 * (824 / 1024),
    height: 0.336,
  },
  facebook: {
    width: 0.36,
    height: 0.36 * (3024 / 4032),
  },
} as const;

export const PROJECT_APPLE_PHOTO_POSE = {
  baseZ: 0.0503,
  // Combines the frame's old lean with the layout editor's +0.2112 yaw.
  rotation: [
    -0.06006882511488772, 0.11082233295654853, 0.012648384603073642,
  ] as const,
} as const;

export const PROJECT_APPLE_MARK_POSE = {
  baseZ: 0.0445,
  rotationY: -0.1532,
  scaleRatio: 0.9233,
} as const;

export const PROJECT_SMALL_PLANT_POSE = {
  baseZ: -0.2044,
} as const;

const PROJECT_APPLE_MARK_AUTHORED_HALF_X =
  (ABOUT_LOWER_AWARD_SCALE / 2) *
  (Math.abs(Math.cos(ABOUT_APPLE_ROOT_YAW + ABOUT_APPLE_MARK_YAW)) *
    ABOUT_APPLE_BASE_WIDTH +
    Math.abs(Math.sin(ABOUT_APPLE_ROOT_YAW + ABOUT_APPLE_MARK_YAW)) *
      ABOUT_APPLE_BASE_DEPTH);

const PROJECT_ARTIFACT_BASE_DIMENSIONS = {
  icon: 0.32,
  die: 0.16,
  lampHalfX: 0.164,
  applePhotoHalfX: deskFrameWidth(PROJECT_PHOTO_DIMENSIONS.apple.width) / 2,
  appleMarkHalfX:
    ABOUT_LOWER_AWARD_SCALE *
    PROJECT_APPLE_MARK_POSE.scaleRatio *
    0.5 *
    (Math.abs(
      Math.cos(
        ABOUT_APPLE_ROOT_YAW +
          ABOUT_APPLE_MARK_YAW +
          PROJECT_APPLE_MARK_POSE.rotationY,
      ),
    ) *
      ABOUT_APPLE_BASE_WIDTH +
      Math.abs(
        Math.sin(
          ABOUT_APPLE_ROOT_YAW +
            ABOUT_APPLE_MARK_YAW +
            PROJECT_APPLE_MARK_POSE.rotationY,
        ),
      ) *
        ABOUT_APPLE_BASE_DEPTH),
  plantHalfX: 0.171,
} as const;

function justifyShelfRow(halfWidths: readonly number[]) {
  const occupied = halfWidths.reduce(
    (sum, halfWidth) => sum + halfWidth * 2,
    0,
  );
  const gap = (SHELF_GEOMETRY.width - occupied) / (halfWidths.length + 1);
  let edge = -SHELF_GEOMETRY.width / 2 + gap;
  const centers = halfWidths.map((halfWidth) => {
    const center = edge + halfWidth;
    edge = center + halfWidth + gap;
    return center;
  });
  return { centers, gap };
}

// Preserve the four untouched positions from the previously justified row.
// The owner placed the photo, Apple mark, and plant independently afterward.
const PROJECT_TOP_ROW_BASELINE = justifyShelfRow([
  PROJECT_ARTIFACT_BASE_DIMENSIONS.lampHalfX,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.icon / 2,
  (PROJECT_ARTIFACT_BASE_DIMENSIONS.die * 3) / 2,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.icon / 2,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.applePhotoHalfX,
  PROJECT_APPLE_MARK_AUTHORED_HALF_X,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.plantHalfX,
]);

export const PROJECT_ARTIFACT_DIMENSIONS = {
  ...PROJECT_ARTIFACT_BASE_DIMENSIONS,
} as const;

const DIE = PROJECT_ARTIFACT_DIMENSIONS.die;

/** Six independent authored poses. Shared edges are deliberate: once the
 * optional solver is warm, moving a supporting die wakes the bodies resting
 * against it instead of leaving a visually connected stack floating apart. */
export const PROJECT_DICE_LAYOUT = [
  {
    id: "bottom-left",
    x: -DIE,
    y: 0,
    z: 0,
    front: 3,
    right: 5,
    top: 1,
    yaw: 0.04,
  },
  {
    id: "bottom-center",
    x: 0,
    y: 0,
    z: 0,
    front: 5,
    right: 2,
    top: 4,
    yaw: -0.03,
  },
  {
    id: "bottom-right",
    x: DIE,
    y: 0,
    z: 0,
    front: 2,
    right: 6,
    top: 3,
    yaw: 0.025,
  },
  {
    id: "middle-left",
    x: -DIE / 2,
    y: DIE,
    z: 0,
    front: 6,
    right: 1,
    top: 4,
    yaw: -0.02,
  },
  {
    id: "middle-right",
    x: DIE / 2,
    y: DIE,
    z: 0,
    front: 4,
    right: 3,
    top: 2,
    yaw: 0.035,
  },
  { id: "top", x: 0, y: DIE * 2, z: 0, front: 1, right: 5, top: 6, yaw: -0.04 },
] as const;

/** Measured envelopes for hand-authored rows that do not use the generic
 * packer. These make spacing and support executable rather than visual-only. */
export const REVIEWED_SHELF_LAYOUT = {
  projects: {
    topLampX: PROJECT_TOP_ROW_BASELINE.centers[0]!,
    topWeightliftingIconX: PROJECT_TOP_ROW_BASELINE.centers[1]!,
    topDiceCenterX: PROJECT_TOP_ROW_BASELINE.centers[2]!,
    topHomeworkIconX: PROJECT_TOP_ROW_BASELINE.centers[3]!,
    // Owner placement via the scene layout editor, 2026-09-01.
    topApplePhotoX: 0.6252,
    topAppleMarkX: 0.9342,
    topPlantX: 1.2101,
    trophyX: -0.72,
    trophyHalfX: 0.15,
    facebookPhotoX: -0.405,
    facebookPhotoHalfX:
      deskFrameWidth(PROJECT_PHOTO_DIMENSIONS.facebook.width) / 2,
    // 2026-08-23: the notebook went to the Systems shelf (where the lighthouse
    // print used to be) and the phone slid left into its place, so the two
    // circuit boards that switch the pixel-art finish could stand between the
    // phone and the Mac. The Arduino lies flat mid-plank; the green card
    // stands behind it, level with the Mac, so the two boards overlap in x
    // but not in depth. Both sat 0.16 further forward at first ("shift both
    // back further", 2026-08-23).
    phoneX: -0.04,
    phoneHalfX: 0.132,
    phoneSeat: 0.025,
    arduinoX: 0.22,
    arduinoHalfX: 0.1,
    arduinoZ: 0.02,
    cardX: 0.46,
    cardHalfX: 0.13,
    cardZ: -0.15,
    // The GLB's visible case is offset to the right of its origin. At 0.64
    // its left foot overlapped the face-up phone; 0.95 leaves a deliberate
    // visual gap while retaining a visible edge beside the desktop placard.
    macX: 0.95,
    macHalfX: 0.567,
    /** The case itself: the GLB's 0.0561 × 0.0548 footprint at scale 9.2 and
     * yaw −0.34 projects to ±0.327 about the origin (stacks-render report). */
    macCaseHalfX: 0.327,
    placardEdgeAt1280: 0.467,
  },
  training: {
    shakerX: [0.94, 1.1, 1.24] as const,
    shakerRadius: 0.077,
  },
  about: {
    // Owner placement via the scene layout editor, 2026-08-22; the arch
    // print moved in toward the portrait on 2026-09-06.
    speakingPrintX: 0.274,
    speakingPrintHalfX: 0.167,
    archPrintX: -0.6993,
    archPrintHalfX: 0.134,
    profileSeat: 0.133,
  },
} as const;

export function reviewedShelfLayoutSnapshot() {
  const { projects, training, about } = REVIEWED_SHELF_LAYOUT;
  return {
    projectsTopOrder: [
      projects.topLampX,
      projects.topWeightliftingIconX,
      projects.topDiceCenterX,
      projects.topHomeworkIconX,
      projects.topApplePhotoX,
      projects.topAppleMarkX,
      projects.topPlantX,
    ],
    projectsLampIconGap:
      projects.topWeightliftingIconX -
      PROJECT_ARTIFACT_DIMENSIONS.icon / 2 -
      (projects.topLampX + PROJECT_ARTIFACT_DIMENSIONS.lampHalfX),
    projectsWeightliftingDiceGap:
      projects.topDiceCenterX -
      (PROJECT_ARTIFACT_DIMENSIONS.die * 3) / 2 -
      (projects.topWeightliftingIconX + PROJECT_ARTIFACT_DIMENSIONS.icon / 2),
    projectsDiceHomeworkGap:
      projects.topHomeworkIconX -
      PROJECT_ARTIFACT_DIMENSIONS.icon / 2 -
      (projects.topDiceCenterX + (PROJECT_ARTIFACT_DIMENSIONS.die * 3) / 2),
    projectsHomeworkPhotoGap:
      projects.topApplePhotoX -
      PROJECT_ARTIFACT_DIMENSIONS.applePhotoHalfX -
      (projects.topHomeworkIconX + PROJECT_ARTIFACT_DIMENSIONS.icon / 2),
    projectsPhotoAppleGap:
      projects.topAppleMarkX -
      PROJECT_ARTIFACT_DIMENSIONS.appleMarkHalfX -
      (projects.topApplePhotoX + PROJECT_ARTIFACT_DIMENSIONS.applePhotoHalfX),
    projectsApplePlantGap:
      projects.topPlantX -
      PROJECT_ARTIFACT_DIMENSIONS.plantHalfX -
      (projects.topAppleMarkX + PROJECT_ARTIFACT_DIMENSIONS.appleMarkHalfX),
    projectsTopLeftMargin:
      projects.topLampX -
      PROJECT_ARTIFACT_DIMENSIONS.lampHalfX +
      SHELF_GEOMETRY.width / 2,
    projectsTopRightMargin:
      SHELF_GEOMETRY.width / 2 -
      (projects.topPlantX + PROJECT_ARTIFACT_DIMENSIONS.plantHalfX),
    projectsTrophyPhotoGap:
      projects.facebookPhotoX -
      projects.facebookPhotoHalfX -
      (projects.trophyX + projects.trophyHalfX),
    projectsPhotoPhoneGap:
      projects.phoneX -
      projects.phoneHalfX -
      (projects.facebookPhotoX + projects.facebookPhotoHalfX),
    projectsPhoneArduinoGap:
      projects.arduinoX -
      projects.arduinoHalfX -
      (projects.phoneX + projects.phoneHalfX),
    // The card stands behind the Arduino's right half, so this is measured
    // to the Mac's visible case, not to the Arduino.
    projectsCardMacGap:
      projects.macX -
      projects.macCaseHalfX -
      (projects.cardX + projects.cardHalfX),
    projectsPhoneMacCenterGap: projects.macX - projects.phoneX,
    projectsMacVisibleWidth:
      projects.placardEdgeAt1280 - (projects.macX - projects.macHalfX),
    trainingRightEdge: training.shakerX[2] + training.shakerRadius,
    trainingShelfRight: SHELF_GEOMETRY.width / 2,
    aboutFlatPrintGap:
      Math.abs(about.archPrintX - about.speakingPrintX) -
      about.archPrintHalfX -
      about.speakingPrintHalfX,
  };
}
