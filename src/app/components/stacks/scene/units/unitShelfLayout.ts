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
  baseZ: 0.08,
  rotation: [-0.06, -0.1, 0] as const,
} as const;

const PROJECT_ARTIFACT_BASE_DIMENSIONS = {
  icon: 0.32,
  die: 0.16,
  lampHalfX: 0.164,
  applePhotoHalfX: deskFrameWidth(PROJECT_PHOTO_DIMENSIONS.apple.width) / 2,
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

const PROJECT_TOP_ROW = justifyShelfRow([
  PROJECT_ARTIFACT_BASE_DIMENSIONS.lampHalfX,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.icon / 2,
  (PROJECT_ARTIFACT_BASE_DIMENSIONS.die * 3) / 2,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.icon / 2,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.applePhotoHalfX,
  PROJECT_ARTIFACT_BASE_DIMENSIONS.plantHalfX,
]);

export const PROJECT_ARTIFACT_DIMENSIONS = {
  ...PROJECT_ARTIFACT_BASE_DIMENSIONS,
  topRowGap: PROJECT_TOP_ROW.gap,
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
    // Derived from the visible GLB, billet, dice, and framed-photo envelopes.
    // Five internal gaps and both plank margins are therefore identical.
    topLampX: PROJECT_TOP_ROW.centers[0]!,
    topWeightliftingIconX: PROJECT_TOP_ROW.centers[1]!,
    topDiceCenterX: PROJECT_TOP_ROW.centers[2]!,
    topHomeworkIconX: PROJECT_TOP_ROW.centers[3]!,
    topApplePhotoX: PROJECT_TOP_ROW.centers[4]!,
    topPlantX: PROJECT_TOP_ROW.centers[5]!,
    trophyX: -0.72,
    trophyHalfX: 0.15,
    facebookPhotoX: -0.405,
    facebookPhotoHalfX:
      deskFrameWidth(PROJECT_PHOTO_DIMENSIONS.facebook.width) / 2,
    notebookX: 0.055,
    notebookHalfX: 0.25,
    notebookZ: SHELF_GEOMETRY.lower.centerZ,
    phoneX: 0.54,
    phoneHalfX: 0.132,
    phoneSeat: 0.025,
    // The GLB's visible case is offset to the right of its origin. At 0.64
    // its left foot overlapped the face-up phone; 0.95 leaves a deliberate
    // visual gap while retaining a visible edge beside the desktop placard.
    macX: 0.95,
    macHalfX: 0.567,
    placardEdgeAt1280: 0.467,
  },
  training: {
    shakerX: [0.86, 1.06, 1.24] as const,
    shakerRadius: 0.077,
  },
  about: {
    speakingPrintX: 0.16,
    speakingPrintHalfX: 0.167,
    archPrintX: -0.81,
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
    projectsPhotoPlantGap:
      projects.topPlantX -
      PROJECT_ARTIFACT_DIMENSIONS.plantHalfX -
      (projects.topApplePhotoX + PROJECT_ARTIFACT_DIMENSIONS.applePhotoHalfX),
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
    projectsPhotoNotebookGap:
      projects.notebookX -
      projects.notebookHalfX -
      (projects.facebookPhotoX + projects.facebookPhotoHalfX),
    projectsNotebookPhoneGap:
      projects.phoneX -
      projects.phoneHalfX -
      (projects.notebookX + projects.notebookHalfX),
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
