import { describe, expect, it } from "vitest";

import {
  heldDepthBounds,
  heldDepthFromPinch,
  heldDepthWheelPixels,
  nextHeldDepth,
} from "./heldDepth";

describe("held prop depth", () => {
  it("normalizes pixel, line, and page wheel deltas", () => {
    expect(heldDepthWheelPixels(12, 0, 800)).toBe(12);
    expect(heldDepthWheelPixels(2, 1, 800)).toBe(66);
    expect(heldDepthWheelPixels(0.5, 2, 800)).toBe(400);
  });

  it("pulls closer on wheel up and pushes farther on wheel down", () => {
    const bounds = heldDepthBounds(5);

    expect(nextHeldDepth(5, -100, bounds)).toBe(4.75);
    expect(nextHeldDepth(5, 100, bounds)).toBe(5.25);
  });

  it("keeps the prop in front of the camera and near its pickup depth", () => {
    const bounds = heldDepthBounds(5);

    expect(nextHeldDepth(5, -10_000, bounds)).toBe(bounds.min);
    expect(nextHeldDepth(5, 10_000, bounds)).toBe(bounds.max);
    expect(bounds.min).toBeCloseTo(1.4);
    expect(bounds.max).toBe(6.4);
  });

  it("pulls closer as fingers spread and pushes farther as they pinch", () => {
    const bounds = heldDepthBounds(5);

    expect(heldDepthFromPinch(5, 100, 200, bounds)).toBe(2.5);
    expect(heldDepthFromPinch(5, 100, 50, bounds)).toBe(bounds.max);
  });

  it("clamps noisy and extreme pinch spans", () => {
    const bounds = heldDepthBounds(5);

    expect(heldDepthFromPinch(5, 1, 2, bounds)).toBe(5);
    expect(heldDepthFromPinch(5, 100, 1_000, bounds)).toBe(bounds.min);
  });
});
