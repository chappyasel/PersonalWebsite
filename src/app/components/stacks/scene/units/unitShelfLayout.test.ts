import { deskFrameWidth } from "../photoGeometry";
import { describe, expect, it } from "vitest";

import {
  PROJECT_APPLE_MARK_POSE,
  PROJECT_APPLE_PHOTO_POSE,
  PROJECT_ARTIFACT_DIMENSIONS,
  PROJECT_DICE_LAYOUT,
  PROJECT_PHOTO_DIMENSIONS,
  PROJECT_SMALL_PLANT_POSE,
  REVIEWED_SHELF_LAYOUT,
  reviewedShelfLayoutSnapshot,
} from "./unitShelfLayout";

describe("reviewed authored shelf rows", () => {
  it("keeps the Projects devices separated and the Mac reachable", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.projectsPhotoPhoneGap).toBeGreaterThanOrEqual(0.02);
    expect(snapshot.projectsPhoneArduinoGap).toBeGreaterThanOrEqual(0.02);
    expect(snapshot.projectsCardMacGap).toBeGreaterThanOrEqual(0);
    expect(snapshot.projectsPhoneMacCenterGap).toBeGreaterThanOrEqual(0.35);
    expect(snapshot.projectsMacVisibleWidth).toBeGreaterThanOrEqual(0.08);
    expect(REVIEWED_SHELF_LAYOUT.projects.phoneSeat).toBeGreaterThanOrEqual(
      0.0247,
    );
    // The card stands behind the Arduino: they may share x, never depth.
    expect(REVIEWED_SHELF_LAYOUT.projects.cardZ).toBeLessThan(
      REVIEWED_SHELF_LAYOUT.projects.arduinoZ - 0.1,
    );
  });

  it("keeps the right shaker on its plank", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.trainingRightEdge).toBeLessThanOrEqual(
      snapshot.trainingShelfRight,
    );
  });

  it("persists the owner-reviewed upper Projects composition", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.projectsTopOrder).toEqual(
      [...snapshot.projectsTopOrder].sort((a, b) => a - b),
    );
    expect(REVIEWED_SHELF_LAYOUT.projects.topApplePhotoX).toBe(0.6252);
    expect(REVIEWED_SHELF_LAYOUT.projects.topAppleMarkX).toBe(0.9342);
    expect(REVIEWED_SHELF_LAYOUT.projects.topPlantX).toBe(1.2101);
    expect(PROJECT_APPLE_PHOTO_POSE).toEqual({
      baseZ: 0.0503,
      rotation: [
        -0.06006882511488772, 0.11082233295654853, 0.012648384603073642,
      ],
    });
    expect(PROJECT_APPLE_MARK_POSE).toEqual({
      baseZ: 0.0445,
      rotationY: -0.1532,
      scaleRatio: 0.9233,
    });
    expect(PROJECT_SMALL_PLANT_POSE.baseZ).toBe(-0.2044);
    expect(snapshot.projectsPhotoAppleGap).toBeGreaterThan(0);
    expect(snapshot.projectsApplePlantGap).toBeGreaterThan(0);
    expect(PROJECT_ARTIFACT_DIMENSIONS.applePhotoHalfX).toBe(
      deskFrameWidth(PROJECT_PHOTO_DIMENSIONS.apple.width) / 2,
    );
    expect(REVIEWED_SHELF_LAYOUT.projects.topLampX).toBeGreaterThanOrEqual(
      -1.32 + PROJECT_ARTIFACT_DIMENSIONS.lampHalfX,
    );
    // The foliage may cross the plank edge, but its planter remains seated.
    expect(REVIEWED_SHELF_LAYOUT.projects.topPlantX).toBeLessThan(1.32);
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
