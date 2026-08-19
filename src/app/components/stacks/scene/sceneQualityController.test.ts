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
});
