import { describe, expect, it } from "vitest";

import {
  projectArtifactInspectionLighting,
  projectArtifactRoomLighting,
} from "./projectArtifactLighting";

describe("project artifact lighting", () => {
  it.each([false, true])(
    "uses the room palette in the inspection renderer when dark=%s",
    (dark) => {
      expect(projectArtifactInspectionLighting(dark)).toEqual(
        projectArtifactRoomLighting(dark),
      );
    },
  );

  it("keeps the warm key and cool environment roles in dark mode", () => {
    const lighting = projectArtifactInspectionLighting(true);
    expect(lighting.key.color).toBe("#efd0b1");
    expect(lighting.warmEnvironment.color).toBe("#ffc98f");
    expect(lighting.coolEnvironment.color).toBe("#414f70");
  });
});
