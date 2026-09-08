import { describe, expect, it } from "vitest";

import {
  POINTER_ARRIVAL_MAX_FRAME_SECONDS,
  POINTER_ARRIVAL_SECONDS,
  advancePointerArrival,
  pointerArrivalWeight,
  pointerFromRest,
} from "./pointerArrival";

const FRAME = 1 / 60;
const TOTAL = POINTER_ARRIVAL_SECONDS;

function run(
  frames: number,
  input: { revealed: boolean; pointerSeen: boolean },
  start = 0,
) {
  let elapsed = start;
  for (let i = 0; i < frames; i += 1) {
    elapsed = advancePointerArrival(elapsed, { ...input, frameSeconds: FRAME });
  }
  return elapsed;
}

describe("pointer arrival", () => {
  it("holds at zero while the boot screen is still up, whatever the mouse does", () => {
    expect(run(600, { revealed: false, pointerSeen: true })).toBe(0);
    expect(run(600, { revealed: false, pointerSeen: false })).toBe(0);
  });

  it("holds after the reveal until r3f has heard from the pointer", () => {
    // A mouse that sits still through the boot moves nothing, so the ramp
    // waits for its first move rather than spending itself on nobody.
    expect(run(600, { revealed: true, pointerSeen: false })).toBe(0);
    // A pointer crossing exactly (0, 0) mid-ramp holds rather than resets.
    expect(run(1, { revealed: true, pointerSeen: false }, 0.4)).toBe(0.4);
  });

  it("runs the clock to the end of the ramp once both gates are open", () => {
    const framesToFull = Math.ceil(TOTAL / FRAME);
    const almost = run(framesToFull - 2, {
      revealed: true,
      pointerSeen: true,
    });
    expect(almost).toBeGreaterThan(TOTAL - 3 * FRAME);
    expect(almost).toBeLessThan(TOTAL);
    expect(run(framesToFull + 1, { revealed: true, pointerSeen: true })).toBe(
      TOTAL,
    );
  });

  it("caps a returning tab's delta so the ramp cannot finish in one frame", () => {
    expect(
      advancePointerArrival(0, {
        revealed: true,
        pointerSeen: true,
        frameSeconds: 30,
      }),
    ).toBe(POINTER_ARRIVAL_MAX_FRAME_SECONDS);
    expect(
      advancePointerArrival(0.5, {
        revealed: true,
        pointerSeen: true,
        frameSeconds: Number.NaN,
      }),
    ).toBe(0.5);
    expect(
      advancePointerArrival(0.5, {
        revealed: true,
        pointerSeen: true,
        frameSeconds: -1,
      }),
    ).toBe(0.5);
  });

  it("rearms when the room boots again", () => {
    expect(
      advancePointerArrival(TOTAL, {
        revealed: false,
        pointerSeen: true,
        frameSeconds: FRAME,
      }),
    ).toBe(0);
  });

  it("moves on the first frame, then eases in and out", () => {
    expect(POINTER_ARRIVAL_SECONDS).toBe(2);
    expect(pointerArrivalWeight(0)).toBe(0);
    expect(pointerArrivalWeight(FRAME)).toBeGreaterThan(0);
    expect(pointerArrivalWeight(TOTAL)).toBe(1);
    expect(pointerArrivalWeight(TOTAL + 5)).toBe(1);
    expect(pointerArrivalWeight(-1)).toBe(0);
    expect(pointerArrivalWeight(0.1)).toBeLessThan(0.01);
    expect(pointerArrivalWeight(0.5)).toBeGreaterThan(0.15);
    expect(pointerArrivalWeight(0.5)).toBeLessThan(0.16);
    expect(pointerArrivalWeight(1)).toBe(0.5);
    expect(pointerArrivalWeight(1.9)).toBeGreaterThan(0.99);
    let previous = 0;
    for (let t = FRAME; t <= TOTAL; t += 0.05) {
      const weight = pointerArrivalWeight(t);
      expect(weight).toBeGreaterThan(previous);
      previous = weight;
    }
  });

  it("reads the pointer from its rest, which is the parallax centre for the run", () => {
    // Zero weight is the rest, not the screen centre: a desktop stop's
    // neutral sits in the gap beside the dock, so (0, 0) would already turn
    // the room, which the boot stage never projected.
    expect(pointerFromRest(0.9, -0.24, 0)).toBe(-0.24);
    expect(pointerFromRest(0.9, 0, 0)).toBe(0);
    expect(pointerFromRest(0.9, -0.24, 1)).toBeCloseTo(0.9);
    expect(pointerFromRest(0.9, -0.24, 0.5)).toBeCloseTo(0.33);
    expect(pointerFromRest(-0.5, 0, 0.25)).toBeCloseTo(-0.125);
    // Guards match pointerCameraYawDegrees: an off-screen or NaN centre is
    // the screen centre, an unreadable pointer is the rest, weight clamps.
    expect(pointerFromRest(0.9, 1, 0)).toBe(0);
    expect(pointerFromRest(0.9, Number.NaN, 0)).toBe(0);
    expect(pointerFromRest(Number.NaN, -0.24, 1)).toBe(-0.24);
    expect(pointerFromRest(0.9, -0.24, 2)).toBeCloseTo(0.9);
    expect(pointerFromRest(0.9, -0.24, -1)).toBe(-0.24);
  });
});
