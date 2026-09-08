import { afterEach, describe, expect, it } from "vitest";

import {
  SKY_DEPTH_DEFAULT,
  SKY_DEPTH_GAIN_RANGE,
  SKY_DEPTH_SPREAD_RANGE,
  createSkyDepthController,
  skyLayerPanOffsets,
} from "./skyDepthLayers";

describe("sky depth layers", () => {
  it("leaves the painting rigid while both sources are off", () => {
    const offsets = skyLayerPanOffsets({
      panDelta: 0.6,
      turn: 0.12,
      state: SKY_DEPTH_DEFAULT,
    });
    expect(offsets).toEqual({ city: 0, hills: 0, bridge: 0 });
  });

  it("anchors the traverse layers at the About stop and parts them across the row", () => {
    const state = { ...SKY_DEPTH_DEFAULT, traverse: true };
    expect(skyLayerPanOffsets({ panDelta: 0, turn: 0.2, state })).toEqual({
      city: 0,
      hills: 0,
      bridge: 0,
    });
    const end = skyLayerPanOffsets({ panDelta: 0.6, turn: 0.2, state });
    expect(end.city).toBeCloseTo(0.6 * SKY_DEPTH_DEFAULT.spread, 10);
    expect(end.hills).toBe(0);
    expect(end.bridge).toBeCloseTo(-end.city, 10);
  });

  it("slides the layers with the pointer turn, scaled by the gain", () => {
    const state = { ...SKY_DEPTH_DEFAULT, pointer: true, gain: 3 };
    const turned = skyLayerPanOffsets({ panDelta: 0.6, turn: 0.1, state });
    expect(turned.city).toBeCloseTo(0.1 * SKY_DEPTH_DEFAULT.spread * 3, 10);
    expect(turned.bridge).toBeCloseTo(-turned.city, 10);
    // A left turn slides the other way; no turn, no slide.
    expect(
      skyLayerPanOffsets({ panDelta: 0.6, turn: -0.1, state }).city,
    ).toBeCloseTo(-turned.city, 10);
    expect(skyLayerPanOffsets({ panDelta: 0.6, turn: 0, state })).toEqual({
      city: 0,
      hills: 0,
      bridge: 0,
    });
  });

  it("adds both sources and clamps the knobs to their ranges", () => {
    const state = {
      traverse: true,
      pointer: true,
      spread: SKY_DEPTH_SPREAD_RANGE.max + 1,
      gain: SKY_DEPTH_GAIN_RANGE.max + 1,
    };
    const both = skyLayerPanOffsets({ panDelta: 0.6, turn: 0.1, state });
    expect(both.city).toBeCloseTo(
      0.6 * SKY_DEPTH_SPREAD_RANGE.max +
        0.1 * SKY_DEPTH_SPREAD_RANGE.max * SKY_DEPTH_GAIN_RANGE.max,
      10,
    );
    expect(
      skyLayerPanOffsets({
        panDelta: Number.NaN,
        turn: Number.NaN,
        state: { ...state, spread: Number.NaN, gain: Number.NaN },
      }),
    ).toEqual({ city: 0, hills: 0, bridge: 0 });
  });

  describe("console controller", () => {
    const controller = createSkyDepthController();

    afterEach(() => controller.reset());

    it("starts with both sources off and clamps the knobs", () => {
      expect(controller.getSnapshot()).toEqual(SKY_DEPTH_DEFAULT);
      controller.setTraverse(true);
      controller.setPointer(true);
      controller.setSpread(9);
      controller.setGain(-1);
      expect(controller.getSnapshot()).toEqual({
        traverse: true,
        pointer: true,
        spread: SKY_DEPTH_SPREAD_RANGE.max,
        gain: SKY_DEPTH_GAIN_RANGE.min,
      });
      controller.reset();
      expect(controller.getSnapshot()).toEqual(SKY_DEPTH_DEFAULT);
    });

    it("notifies subscribers only on a change", () => {
      let calls = 0;
      const unsubscribe = controller.subscribe(() => {
        calls += 1;
      });
      controller.setSpread(SKY_DEPTH_DEFAULT.spread);
      expect(calls).toBe(0);
      controller.setSpread(0.3);
      expect(calls).toBe(1);
      unsubscribe();
    });
  });
});
