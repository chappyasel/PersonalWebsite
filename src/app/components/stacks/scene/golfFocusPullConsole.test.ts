import { afterEach, describe, expect, it } from "vitest";

import {
  GOLF_FOCUS_PULL_CONSOLE_DEFAULT,
  createGolfFocusPullConsoleController,
} from "./golfFocusPullConsole";
import {
  type GolfFocusPullVariant,
  golfFocusPullVariant,
  setGolfFocusPullVariant,
} from "./shelfDepthOfField";

describe("golf focus pull console seam", () => {
  afterEach(() => setGolfFocusPullVariant("current"));

  it("ships on the current rack and writes the seam the effect reads", () => {
    const controller = createGolfFocusPullConsoleController();
    expect(controller.getSnapshot()).toEqual(GOLF_FOCUS_PULL_CONSOLE_DEFAULT);
    expect(golfFocusPullVariant()).toBe("current");
    controller.setVariant("legacy");
    expect(golfFocusPullVariant()).toBe("legacy");
    controller.reset();
    expect(golfFocusPullVariant()).toBe("current");
  });

  it("notifies subscribers only on a change, through an injected seam", () => {
    let seam: GolfFocusPullVariant = "current";
    const controller = createGolfFocusPullConsoleController(
      () => seam,
      (next) => {
        seam = next;
      },
    );
    let calls = 0;
    const unsubscribe = controller.subscribe(() => {
      calls += 1;
    });
    controller.setVariant("current");
    expect(calls).toBe(0);
    controller.setVariant("legacy");
    expect(calls).toBe(1);
    expect(seam).toBe("legacy");
    unsubscribe();
    controller.setVariant("current");
    expect(calls).toBe(1);
  });
});
