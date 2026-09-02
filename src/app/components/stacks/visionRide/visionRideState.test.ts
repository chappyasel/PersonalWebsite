import { useStacks } from "../store";
import { beforeEach, describe, expect, it } from "vitest";

import { visionRideRoomMounted } from "./visionRideState";
import {
  DEFAULT_VISION_RIDE_SESSION_PROFILE,
  EMPTY_VISION_RIDE_MODIFIERS,
} from "./visionRideProfiles";
import { visionProDisplayDiagnosticsController } from "../scene/visionProDisplayDiagnostics";

describe("Vision ride state machine", () => {
  beforeEach(() => {
    useStacks.setState({
      visionRidePhase: "idle",
      visionRideReady: false,
      visionRideSessionFailed: false,
      visionRideError: null,
      visionRideExitMethod: null,
      visionRideStartedAt: null,
      visionRideModelStatus: "idle",
      visionRideAnnouncement: "",
      visionRideModifiers: EMPTY_VISION_RIDE_MODIFIERS,
      visionRideShakers: [],
      visionRideSessionProfile: DEFAULT_VISION_RIDE_SESSION_PROFILE,
    });
    visionProDisplayDiagnosticsController.reset();
  });

  it("prevents re-entry and starts only after readiness", () => {
    const state = useStacks.getState();
    state.beginVisionRide();
    state.beginVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("donning");
    state.startVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("donning");
    state.markVisionRideReady();
    state.startVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("cruising");
  });

  it("latches the front display only after the headset has been put on", () => {
    const state = useStacks.getState();

    expect(
      visionProDisplayDiagnosticsController.getSnapshot().enabled,
    ).toBe(false);
    state.beginVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("donning");
    expect(
      visionProDisplayDiagnosticsController.getSnapshot().enabled,
    ).toBe(false);

    state.markVisionRideReady();
    state.startVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("cruising");
    expect(
      visionProDisplayDiagnosticsController.getSnapshot().enabled,
    ).toBe(true);

    state.requestVisionRideExit("button");
    state.showVisionRideReturn();
    state.finishVisionRide();
    expect(
      visionProDisplayDiagnosticsController.getSnapshot().enabled,
    ).toBe(true);
  });

  it("handles early Escape and idempotent exit", () => {
    const state = useStacks.getState();
    state.beginVisionRide();
    state.requestVisionRideExit("escape");
    state.requestVisionRideExit("button");
    expect(useStacks.getState()).toMatchObject({
      visionRidePhase: "doffing",
      visionRideExitMethod: "escape",
    });
    state.showVisionRideReturn();
    state.finishVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("idle");
  });

  it("recovers from errors and disables the ride for the session", () => {
    const state = useStacks.getState();
    state.beginVisionRide();
    state.failVisionRide(new Error("model"));
    expect(useStacks.getState()).toMatchObject({
      visionRidePhase: "doffing",
      visionRideSessionFailed: true,
      visionRideModelStatus: "failed",
      visionRideExitMethod: "error",
    });
    state.resetVisionRide();
    useStacks.getState().beginVisionRide();
    expect(useStacks.getState().visionRidePhase).toBe("idle");
  });

  it("mounts the room for the shelf, the donning flight and the return only", () => {
    expect(visionRideRoomMounted("idle")).toBe(true);
    expect(visionRideRoomMounted("donning")).toBe(true);
    expect(visionRideRoomMounted("cruising")).toBe(false);
    expect(visionRideRoomMounted("doffing")).toBe(false);
    expect(visionRideRoomMounted("returning")).toBe(true);
  });

  it("clears the room-hidden flag whenever the ride ends", () => {
    const state = useStacks.getState();
    state.beginVisionRide();
    state.setVisionRideRoomHidden(true);
    expect(useStacks.getState().visionRideRoomHidden).toBe(true);
    // Same value is a no-op, not a new store object.
    const before = useStacks.getState();
    state.setVisionRideRoomHidden(true);
    expect(useStacks.getState()).toBe(before);
    state.finishVisionRide();
    expect(useStacks.getState().visionRideRoomHidden).toBe(false);
    state.setVisionRideRoomHidden(true);
    state.resetVisionRide();
    expect(useStacks.getState().visionRideRoomHidden).toBe(false);
    state.setVisionRideRoomHidden(true);
    state.beginVisionRide();
    expect(useStacks.getState().visionRideRoomHidden).toBe(false);
  });

  it("arms room modifiers and freezes them with the finish at entry", () => {
    const state = useStacks.getState();
    state.armVisionRideModifier("night");
    for (const shaker of ["clear", "navy", "amber"])
      useStacks.getState().noteVisionRideShaker(shaker);
    useStacks.getState().armVisionRideModifier("golf");
    useStacks.getState().setPixelLook("palette");
    useStacks.getState().beginVisionRide();

    expect(useStacks.getState().visionRideSessionProfile).toEqual({
      night: true,
      redline: true,
      golf: true,
      pixelLook: "palette",
    });
    expect(visionProDisplayDiagnosticsController.getSnapshot()).toMatchObject({
      enabled: false,
      variant: "golf",
    });
  });
});
