import { afterEach, describe, expect, it } from "vitest";

import { sceneQualityController } from "./sceneQualityController";

describe("scene quality debug controller", () => {
  afterEach(() => sceneQualityController.resetControls());

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

  it("clamps live DoF tuning and can hand both controls back to the plan", () => {
    sceneQualityController.setDepthOfFieldBokehMultiplier(99);
    sceneQualityController.setDepthOfFieldResolutionScale(0);

    expect(sceneQualityController.getSnapshot()).toMatchObject({
      depthOfFieldBokehMultiplier: 3,
      depthOfFieldResolutionScale: 0.25,
    });

    sceneQualityController.resetDepthOfField();
    expect(sceneQualityController.getSnapshot()).toMatchObject({
      depthOfFieldBokehMultiplier: null,
      depthOfFieldResolutionScale: null,
    });
  });
});
