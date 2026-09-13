// @vitest-environment jsdom
import type * as StacksStore from "../store";
import type { RenderCallback } from "@react-three/fiber";
import { cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sway } from "./eggs";

const harness = vi.hoisted(() => ({
  frame: null as RenderCallback | null,
  revealed: false,
  activeUnit: 0,
  reducedMotion: false,
}));

vi.mock("./unitActivity", () => ({
  useUnitFrame: (callback: RenderCallback) => {
    harness.frame = callback;
  },
}));
vi.mock("../boot/worldBootSession", () => ({
  isWorldRevealed: () => harness.revealed,
}));
vi.mock("../store", async (importOriginal) => ({
  ...(await importOriginal<typeof StacksStore>()),
  useStacks: { getState: () => ({ activeUnit: harness.activeUnit }) },
}));

beforeEach(() => {
  harness.frame = null;
  harness.revealed = false;
  harness.activeUnit = 0;
  harness.reducedMotion = false;
  vi.stubGlobal("matchMedia", () => ({ matches: harness.reducedMotion }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mountPlant() {
  // Run the real Sway hooks and attach their returned R3F ref to a real group.
  // Only the frame scheduler and boot/visibility inputs are controlled here.
  const { result } = renderHook(() =>
    Sway({
      unitIndex: 0,
      amount: 0.016,
      rate: 0.3,
      phase: 0.7,
      children: null,
    }),
  );
  const plant = new Group();
  const { ref } = result.current.props as { ref: RefObject<Group | null> };
  ref.current = plant;
  return plant;
}

function frame(elapsedTime: number, delta = 1 / 60) {
  expect(harness.frame).not.toBeNull();
  harness.frame!(
    { clock: { elapsedTime } } as Parameters<RenderCallback>[0],
    delta,
  );
}

describe("plant sway at room entry", () => {
  it.each([1, 5, 12, 27])(
    "eases out of upright after a %s second load",
    (loadTime) => {
      const plant = mountPlant();
      frame(loadTime);
      expect(plant.rotation.x).toBe(0);
      expect(plant.rotation.z).toBe(0);

      harness.revealed = true;
      frame(loadTime + 1 / 60);
      expect(Math.abs(plant.rotation.x)).toBeLessThan(0.0016);
      expect(Math.abs(plant.rotation.z)).toBeLessThan(0.0016);

      let largestStep = 0;
      for (let i = 2; i <= 120; i++) {
        const previous = plant.rotation.clone();
        frame(loadTime + i / 60);
        largestStep = Math.max(
          largestStep,
          Math.abs(plant.rotation.x - previous.x),
          Math.abs(plant.rotation.z - previous.z),
        );
      }
      expect(largestStep).toBeLessThan(0.0016);
      expect(Math.hypot(plant.rotation.x, plant.rotation.z)).toBeGreaterThan(
        0.001,
      );
    },
  );

  it("does not jump to the current wind phase after a suspended frame", () => {
    const plant = mountPlant();
    frame(1);
    harness.revealed = true;
    frame(31, 30);
    expect(Math.abs(plant.rotation.x)).toBeLessThan(0.0016);
    expect(Math.abs(plant.rotation.z)).toBeLessThan(0.0016);
  });

  it("keeps reduced-motion plants still", () => {
    harness.reducedMotion = true;
    const plant = mountPlant();
    harness.revealed = true;
    frame(5);
    expect(plant.rotation.x).toBe(0);
    expect(plant.rotation.z).toBe(0);
  });

  it("parks distant plants and resumes without a tilt jump", () => {
    const plant = mountPlant();
    harness.revealed = true;
    frame(1);
    const previous = plant.rotation.clone();
    harness.activeUnit = 5;
    frame(20);
    expect(plant.rotation.equals(previous)).toBe(true);
    harness.activeUnit = 0;
    frame(30);
    expect(Math.abs(plant.rotation.x - previous.x)).toBeLessThan(0.0016);
    expect(Math.abs(plant.rotation.z - previous.z)).toBeLessThan(0.0016);
  });
});
