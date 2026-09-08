import { afterEach, describe, expect, it } from "vitest";

import {
  golfSuspenseEnabled,
  setGolfSuspenseEnabled,
} from "./golf/golfSuspense";
import {
  GOLF_SUSPENSE_CONSOLE_DEFAULT,
  golfSuspenseConsoleController,
} from "./golfSuspenseConsole";

describe("cup-edge push-in console switch", () => {
  afterEach(() => setGolfSuspenseEnabled(false));

  it("ships off and writes the gate the golf loop reads", () => {
    expect(GOLF_SUSPENSE_CONSOLE_DEFAULT).toBe(false);
    expect(golfSuspenseConsoleController.getSnapshot()).toBe(false);
    golfSuspenseConsoleController.setEnabled(true);
    expect(golfSuspenseEnabled()).toBe(true);
    golfSuspenseConsoleController.reset();
    expect(golfSuspenseEnabled()).toBe(false);
  });

  it("follows the URL gate and the dev hook, and notifies only on a change", () => {
    let calls = 0;
    const unsubscribe = golfSuspenseConsoleController.subscribe(() => {
      calls += 1;
    });
    setGolfSuspenseEnabled(false);
    expect(calls).toBe(0);
    // What `?suspense=1` and `__stacks.golf.suspense(true)` do.
    setGolfSuspenseEnabled(true);
    expect(calls).toBe(1);
    expect(golfSuspenseConsoleController.getSnapshot()).toBe(true);
    setGolfSuspenseEnabled(true);
    expect(calls).toBe(1);
    unsubscribe();
    setGolfSuspenseEnabled(false);
    expect(calls).toBe(1);
  });
});
