import { describe, expect, it, vi } from "vitest";

import { GOLF_MODE_DEFAULT } from "./golfMode";
import { createGolfModeConsoleController } from "./golfModeConsole";

describe("golf mode console controller", () => {
  it("starts on the shipped defaults", () => {
    expect(createGolfModeConsoleController().getSnapshot()).toEqual(
      GOLF_MODE_DEFAULT,
    );
  });

  it("clamps the dials, notifies once per change, and resets", () => {
    const controller = createGolfModeConsoleController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setValue("enterAbove", 1.7);
    expect(controller.getSnapshot().enterAbove).toBe(1);
    controller.setValue("enterAbove", 1);
    expect(listener).toHaveBeenCalledTimes(1);
    controller.setValue("holdSeconds", Number.NaN);
    expect(controller.getSnapshot().holdSeconds).toBe(0);
    controller.setSource("window");
    controller.setOccluders(false);
    expect(controller.getSnapshot()).toMatchObject({
      source: "window",
      occluders: false,
    });
    expect(listener).toHaveBeenCalledTimes(4);

    controller.reset();
    expect(controller.getSnapshot()).toEqual(GOLF_MODE_DEFAULT);
    controller.reset();
    expect(listener).toHaveBeenCalledTimes(5);
  });
});
