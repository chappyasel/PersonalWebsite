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

/** Measured envelopes for hand-authored rows that do not use the generic
 * packer. These make spacing and support executable rather than visual-only. */
export const REVIEWED_SHELF_LAYOUT = {
  projects: {
    trophyX: -0.72,
    trophyHalfX: 0.12,
    wwdcPhotoX: -0.45,
    wwdcPhotoHalfX: 0.135,
    notebookX: -0.03,
    notebookHalfX: 0.25,
    phoneX: 0.47,
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
    archPrintX: 0.5,
    archPrintHalfX: 0.134,
    profileSeat: 0.133,
  },
} as const;

export function reviewedShelfLayoutSnapshot() {
  const { projects, training, about } = REVIEWED_SHELF_LAYOUT;
  return {
    projectsTrophyPhotoGap:
      projects.wwdcPhotoX -
      projects.wwdcPhotoHalfX -
      (projects.trophyX + projects.trophyHalfX),
    projectsPhotoNotebookGap:
      projects.notebookX -
      projects.notebookHalfX -
      (projects.wwdcPhotoX + projects.wwdcPhotoHalfX),
    projectsDeviceGap:
      projects.phoneX -
      projects.phoneHalfX -
      (projects.notebookX + projects.notebookHalfX),
    projectsPhoneMacCenterGap: projects.macX - projects.phoneX,
    projectsMacVisibleWidth:
      projects.placardEdgeAt1280 - (projects.macX - projects.macHalfX),
    trainingRightEdge: training.shakerX[2] + training.shakerRadius,
    trainingShelfRight: SHELF_GEOMETRY.width / 2,
    aboutFlatPrintGap:
      about.archPrintX -
      about.archPrintHalfX -
      (about.speakingPrintX + about.speakingPrintHalfX),
  };
}
