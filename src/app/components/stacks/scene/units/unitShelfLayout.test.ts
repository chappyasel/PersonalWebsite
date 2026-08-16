import { describe, expect, it } from "vitest";

import {
  REVIEWED_SHELF_LAYOUT,
  reviewedShelfLayoutSnapshot,
} from "./unitShelfLayout";

describe("reviewed authored shelf rows", () => {
  it("keeps the Projects devices separated and the Mac reachable", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.projectsTrophyPhotoGap).toBeGreaterThanOrEqual(0.01);
    expect(snapshot.projectsPhotoNotebookGap).toBeGreaterThanOrEqual(0.03);
    expect(snapshot.projectsDeviceGap).toBeGreaterThanOrEqual(0.1);
    expect(snapshot.projectsPhoneMacCenterGap).toBeGreaterThanOrEqual(0.35);
    expect(snapshot.projectsMacVisibleWidth).toBeGreaterThanOrEqual(0.08);
    expect(REVIEWED_SHELF_LAYOUT.projects.phoneSeat).toBeGreaterThanOrEqual(
      0.0247,
    );
  });

  it("keeps the right shaker on its plank", () => {
    const snapshot = reviewedShelfLayoutSnapshot();
    expect(snapshot.trainingRightEdge).toBeLessThanOrEqual(
      snapshot.trainingShelfRight,
    );
  });

  it("separates the two face-up About prints", () => {
    expect(reviewedShelfLayoutSnapshot().aboutFlatPrintGap).toBeGreaterThan(0);
  });
});
