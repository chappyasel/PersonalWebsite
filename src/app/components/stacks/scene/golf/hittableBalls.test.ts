import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type HittableBall,
  hittableContactPoint,
  hittableBallsFor,
  isHittableBall,
  registerHittableBall,
  resetHittableBalls,
  setHittableBallTapHandler,
  tapHittableBall,
} from "./hittableBalls";

function ball(key: string, unitIndex = 2): HittableBall {
  return {
    key,
    unitIndex,
    radius: 0.1,
    contactHeight: 0.1,
    massKg: 0.1,
    bottom: (out) => out.set(0, 0, 0),
    still: () => true,
    strike: () => undefined,
    hide: () => undefined,
    show: () => undefined,
  };
}

afterEach(() => resetHittableBalls());

describe("the hittable ball registry", () => {
  it("aims the club at the centre of tennis balls and cans", () => {
    expect(
      hittableContactPoint({ x: -2.2, y: -1.115, z: 0.2 }, 0.067),
    ).toEqual({ x: -2.2, y: -1.048, z: 0.2 });
    expect(
      hittableContactPoint({ x: -2.2, y: -1.115, z: 0.2 }, 0.115),
    ).toEqual({ x: -2.2, y: -1, z: 0.2 });
  });

  it("lists balls by unit and forgets them on unregister", () => {
    const off = registerHittableBall(ball("grab:ball:a"));
    registerHittableBall(ball("grab:ball:b", 4));
    expect(hittableBallsFor(2).map((b) => b.key)).toEqual(["grab:ball:a"]);
    off();
    expect(hittableBallsFor(2)).toEqual([]);
  });

  it("routes a tap to the ball's own bay and reports whether it was taken", () => {
    registerHittableBall(ball("grab:ball:a"));
    // No bay mounted: the Grabbable keeps its ordinary tap.
    expect(tapHittableBall("grab:ball:a")).toBe(false);
    const bay = vi.fn((key: string) => key === "grab:ball:a");
    const off = setHittableBallTapHandler(2, bay);
    expect(tapHittableBall("grab:ball:a")).toBe(true);
    expect(tapHittableBall("grab:ball:missing")).toBe(false);
    expect(bay).toHaveBeenCalledTimes(1);
    off();
    expect(tapHittableBall("grab:ball:a")).toBe(false);
  });

  it("tells input dispatchers which keys are hittable", () => {
    const off = registerHittableBall(ball("golf-ball:one"));
    expect(isHittableBall("golf-ball:one")).toBe(true);
    expect(isHittableBall("grab:basketball")).toBe(false);
    off();
    expect(isHittableBall("golf-ball:one")).toBe(false);
  });

  it("hands the bay a world position through the caller's vector", () => {
    registerHittableBall({
      ...ball("grab:ball:a"),
      bottom: (out) => out.set(1, 2, 3),
    });
    const out = new THREE.Vector3();
    expect(hittableBallsFor(2)[0]!.bottom(out)).toBe(out);
    expect(out.toArray()).toEqual([1, 2, 3]);
  });
});
