import { describe, expect, it } from "vitest";

import {
  sceneDebugOverlayPatches,
  sceneDebugOverlayState,
} from "./diagnosticsOverlayControls";

const hiddenPerches = {
  showEnvelopes: false,
  showRoutes: false,
  showFlightVolumes: false,
  showFlightTrails: false,
  showLampCones: false,
  showMothTrails: false,
};
const hiddenPhysics = { showHelpers: false, showAllBounds: false };

describe("unified scene debug overlays", () => {
  it("counts perch and physics overlays as one visual set", () => {
    expect(sceneDebugOverlayState(hiddenPerches, hiddenPhysics)).toEqual({
      enabled: 0,
      total: 8,
      any: false,
      all: false,
    });
    expect(
      sceneDebugOverlayState(
        { ...hiddenPerches, showRoutes: true },
        { ...hiddenPhysics, showAllBounds: true },
      ),
    ).toMatchObject({ enabled: 2, any: true, all: false });
  });

  it("builds complete show and hide patches without simulation controls", () => {
    expect(sceneDebugOverlayPatches(true)).toEqual({
      perches: {
        showEnvelopes: true,
        showRoutes: true,
        showFlightVolumes: true,
        showFlightTrails: true,
        showLampCones: true,
        showMothTrails: true,
      },
      physics: { showHelpers: true, showAllBounds: true },
    });
    expect(sceneDebugOverlayPatches(false).perches).toEqual(hiddenPerches);
    expect(sceneDebugOverlayPatches(false).physics).toEqual(hiddenPhysics);
    expect(sceneDebugOverlayPatches(true)).not.toHaveProperty(
      "pauseAutomaticLandings",
    );
    expect(sceneDebugOverlayPatches(true)).not.toHaveProperty("runtime");
  });
});
