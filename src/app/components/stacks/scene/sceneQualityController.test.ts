import { afterEach, describe, expect, it } from "vitest";

import { sceneQualityController } from "./sceneQualityController";

describe("scene quality debug controller", () => {
  afterEach(() => sceneQualityController.resetControls());

  it("keeps high-frequency runtime telemetry off the scene-control channel", () => {
    let controlNotifications = 0;
    let runtimeNotifications = 0;
    const unsubscribeControls = sceneQualityController.subscribe(() => {
      controlNotifications += 1;
    });
    const unsubscribeRuntime = sceneQualityController.subscribeRuntime(() => {
      runtimeNotifications += 1;
    });
    const runtime = {} as Parameters<
      typeof sceneQualityController.publishRuntime
    >[0];

    sceneQualityController.publishRuntime(runtime);

    expect(sceneQualityController.getRuntimeSnapshot()).toBe(runtime);
    expect(controlNotifications).toBe(0);
    expect(runtimeNotifications).toBe(1);

    sceneQualityController.setFrozen(true);
    expect(controlNotifications).toBe(1);
    expect(runtimeNotifications).toBe(1);

    unsubscribeControls();
    unsubscribeRuntime();
  });

  it("switches named modes, freezes Auto, and signals learned-profile reset", () => {
    let notifications = 0;
    const unsubscribe = sceneQualityController.subscribe(() => {
      notifications += 1;
    });
    sceneQualityController.setMode("efficient");
    sceneQualityController.setFrozen(true);
    sceneQualityController.resetLearnedProfile();

    expect(sceneQualityController.getSnapshot()).toMatchObject({
      mode: "efficient",
      frozen: true,
      resetRequest: 1,
    });
    expect(notifications).toBe(3);
    unsubscribe();
  });

  it("normalizes Cinematic+ to the manual Cinematic plan with a live finish", () => {
    sceneQualityController.setMode("cinematic+");

    expect(sceneQualityController.getSnapshot()).toMatchObject({
      mode: "cinematic",
      cinematicPlus: true,
    });

    sceneQualityController.setMode("auto");
    expect(sceneQualityController.getSnapshot()).toMatchObject({
      mode: "auto",
      cinematicPlus: false,
    });
  });

  it("clamps live DoF tuning and restores the approved lens defaults", () => {
    sceneQualityController.setDepthOfFieldModel("optical-prototype-16");
    sceneQualityController.setDepthOfFieldBokehMultiplier(99);
    sceneQualityController.setDepthOfFieldResolutionScale(0);
    sceneQualityController.updateOpticalDepthOfField({
      fStop: 0.1,
      maxBlurRadius: 100,
      focusDistanceOffset: Number.NaN,
    });

    expect(sceneQualityController.getSnapshot()).toMatchObject({
      depthOfFieldModel: "optical-prototype-16",
      depthOfFieldBokehMultiplier: 8,
      depthOfFieldResolutionScale: 0.1,
      opticalDepthOfField: {
        fStop: 0.7,
        maxBlurRadius: 64,
        focusDistanceOffset: 0,
      },
    });

    sceneQualityController.resetDepthOfField();
    expect(sceneQualityController.getSnapshot()).toMatchObject({
      depthOfFieldModel: "optical-prototype",
      depthOfFieldBokehMultiplier: null,
      depthOfFieldResolutionScale: null,
      opticalDepthOfField: {
        fStop: 1.8,
        maxBlurRadius: 8,
        focusDistanceOffset: 0,
      },
    });
  });
});
