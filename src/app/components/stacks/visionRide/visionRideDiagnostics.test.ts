import { describe, expect, it } from "vitest";

import {
  visionRideDiagnosticsController,
  visionRidePreviewModifiers,
} from "./visionRideDiagnostics";

describe("Vision Ride diagnostics", () => {
  it("runs checkpoints and camera-reactive light trails by default", () => {
    expect(visionRideDiagnosticsController.getSnapshot()).toMatchObject({
      mileMarkersEnabled: true,
      lightTrailsEnabled: true,
    });
  });

  it("leaves the authored session alone by default", () => {
    expect(visionRidePreviewModifiers("authored")).toBeNull();
  });

  it("resolves every modifier combination independently", () => {
    expect(visionRidePreviewModifiers("canonical")).toEqual({
      night: false,
      redline: false,
      golf: false,
    });
    expect(visionRidePreviewModifiers("night-golf")).toEqual({
      night: true,
      redline: false,
      golf: true,
    });
    expect(visionRidePreviewModifiers("full-stack")).toEqual({
      night: true,
      redline: true,
      golf: true,
    });
  });
});
