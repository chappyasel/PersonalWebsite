import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  nearUnits,
  nextUnitToMount,
  unitContentDeferralAllowed,
  uploadUnitTextures,
} from "./unitContentResidency";

describe("nearUnits", () => {
  it("is the arrival shelf and its neighbours", () => {
    expect(nearUnits(3, 7)).toEqual([2, 3, 4]);
  });

  it("clamps at both ends of the room", () => {
    expect(nearUnits(0, 7)).toEqual([0, 1]);
    expect(nearUnits(6, 7)).toEqual([5, 6]);
    expect(nearUnits(-2, 7)).toEqual([0, 1]);
    expect(nearUnits(9, 7)).toEqual([5, 6]);
  });

  it("rounds a camera between two shelves to the nearer one", () => {
    expect(nearUnits(2.6, 7)).toEqual([2, 3, 4]);
  });
});

describe("nextUnitToMount", () => {
  it("mounts nearest first, to the right on a tie", () => {
    const mounted = new Set([0, 1]);
    const order: number[] = [];
    let next = nextUnitToMount(mounted, 0, 7);
    while (next !== null) {
      order.push(next);
      mounted.add(next);
      next = nextUnitToMount(mounted, 0, 7);
    }
    expect(order).toEqual([2, 3, 4, 5, 6]);
  });

  it("prefers the right on an equal distance from a middle shelf", () => {
    expect(nextUnitToMount(new Set([2, 3, 4]), 3, 7)).toBe(5);
  });

  it("follows the camera when it has moved", () => {
    expect(nextUnitToMount(new Set([0, 1, 5, 6]), 6, 7)).toBe(4);
  });

  it("is null once every shelf is mounted", () => {
    expect(nextUnitToMount(new Set([0, 1, 2]), 1, 3)).toBeNull();
  });
});

describe("unitContentDeferralAllowed", () => {
  it("defers for an ordinary visit and its diagnostics", () => {
    expect(unitContentDeferralAllowed("")).toBe(true);
    expect(unitContentDeferralAllowed("?perf-report=1")).toBe(true);
    expect(unitContentDeferralAllowed("?debug=1")).toBe(true);
  });

  it("mounts the whole room for captures and the harness", () => {
    expect(unitContentDeferralAllowed("?screenshot=1")).toBe(false);
    expect(unitContentDeferralAllowed("?harness")).toBe(false);
    expect(unitContentDeferralAllowed("?units=all")).toBe(false);
  });
});

describe("uploadUnitTextures", () => {
  it("uploads each loaded texture under the root once", () => {
    const image = { width: 1, height: 1 };
    const map = new THREE.Texture(image);
    const normal = new THREE.Texture(image);
    const unloaded = new THREE.Texture();
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ map, normalMap: normal }),
      ),
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        [
          new THREE.MeshBasicMaterial({ map }),
          new THREE.MeshBasicMaterial({ map: unloaded }),
        ],
      ),
    );
    const initTexture = vi.fn();
    expect(uploadUnitTextures({ initTexture }, root)).toBe(2);
    expect(initTexture).toHaveBeenCalledWith(map);
    expect(initTexture).toHaveBeenCalledWith(normal);
    expect(initTexture).not.toHaveBeenCalledWith(unloaded);
  });
});
