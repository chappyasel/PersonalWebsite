import { deskFrameWidth } from "../photoGeometry";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { describe, expect, it } from "vitest";

import {
  PROJECT_ARTIFACT_DIMENSIONS,
  PROJECT_DICE_LAYOUT,
  PROJECT_PHOTO_DIMENSIONS,
  REVIEWED_SHELF_LAYOUT,
  reviewedShelfLayoutSnapshot,
} from "./unitShelfLayout";

describe("reviewed authored shelf rows", () => {
  it("keeps the Projects devices separated and the Mac reachable", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.projectsPhotoNotebookGap).toBeGreaterThanOrEqual(0);
    expect(snapshot.projectsNotebookPhoneGap).toBeGreaterThanOrEqual(0.1);
    expect(snapshot.projectsPhoneMacCenterGap).toBeGreaterThanOrEqual(0.35);
    expect(snapshot.projectsMacVisibleWidth).toBeGreaterThanOrEqual(0.08);
    expect(REVIEWED_SHELF_LAYOUT.projects.phoneSeat).toBeGreaterThanOrEqual(
      0.0247,
    );
    expect(REVIEWED_SHELF_LAYOUT.projects.notebookZ).toBe(
      SHELF_GEOMETRY.lower.centerZ,
    );
  });

  it("keeps the right shaker on its plank", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.trainingRightEdge).toBeLessThanOrEqual(
      snapshot.trainingShelfRight,
    );
  });

  it("evenly justifies the six upper Projects clusters", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.projectsTopOrder).toEqual(
      [...snapshot.projectsTopOrder].sort((a, b) => a - b),
    );
    expect(snapshot.projectsLampIconGap).toBeGreaterThanOrEqual(0.05);
    expect(snapshot.projectsWeightliftingDiceGap).toBeGreaterThanOrEqual(0.05);
    expect(snapshot.projectsDiceHomeworkGap).toBeGreaterThanOrEqual(0.05);
    expect(snapshot.projectsHomeworkPhotoGap).toBeGreaterThanOrEqual(0.05);
    expect(snapshot.projectsPhotoPlantGap).toBeGreaterThanOrEqual(0.05);
    expect(PROJECT_ARTIFACT_DIMENSIONS.applePhotoHalfX).toBe(
      deskFrameWidth(PROJECT_PHOTO_DIMENSIONS.apple.width) / 2,
    );
    expect(REVIEWED_SHELF_LAYOUT.projects.topLampX).toBeGreaterThanOrEqual(
      -1.32 + PROJECT_ARTIFACT_DIMENSIONS.lampHalfX,
    );
    expect(REVIEWED_SHELF_LAYOUT.projects.topPlantX).toBeLessThanOrEqual(
      1.32 - PROJECT_ARTIFACT_DIMENSIONS.plantHalfX,
    );
    const gaps = [
      snapshot.projectsTopLeftMargin,
      snapshot.projectsLampIconGap,
      snapshot.projectsWeightliftingDiceGap,
      snapshot.projectsDiceHomeworkGap,
      snapshot.projectsHomeworkPhotoGap,
      snapshot.projectsPhotoPlantGap,
      snapshot.projectsTopRightMargin,
    ];
    gaps.forEach((gap) =>
      expect(gap).toBeCloseTo(PROJECT_ARTIFACT_DIMENSIONS.topRowGap),
    );
  });

  it("authors six unique dice in a three-two-one pyramid", () => {
    expect(PROJECT_DICE_LAYOUT).toHaveLength(6);
    expect(new Set(PROJECT_DICE_LAYOUT.map((die) => die.id)).size).toBe(6);
    expect(
      [0, 1, 2].map(
        (row) =>
          PROJECT_DICE_LAYOUT.filter(
            (die) => die.y === row * PROJECT_ARTIFACT_DIMENSIONS.die,
          ).length,
      ),
    ).toEqual([3, 2, 1]);
  });

  it("separates the two face-up About prints", () => {
    expect(reviewedShelfLayoutSnapshot().aboutFlatPrintGap).toBeGreaterThan(0);
  });
});
