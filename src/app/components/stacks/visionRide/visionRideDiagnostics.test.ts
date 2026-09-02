import { describe, expect, it } from "vitest";

import {
  visionRideDiagnosticsController,
  visionRidePreviewModifiers,
} from "./visionRideDiagnostics";

describe("Vision Ride diagnostics", () => {
  it("keeps mile markers and light trails parked by default", () => {
    expect(visionRideDiagnosticsController.getSnapshot()).toMatchObject({
      mileMarkersEnabled: false,
      lightTrailsEnabled: false,
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
