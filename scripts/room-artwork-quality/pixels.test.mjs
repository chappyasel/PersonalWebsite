import assert from "node:assert/strict";
import test from "node:test";

import { canvasPixels } from "./pixels.mjs";

test("readback restores translucent shaker RGB once, flips rows, and keeps alpha/opaque pixels", () => {
  const raw = new Uint8Array([
    64, 96, 112, 128, 10, 20, 30, 255, 0, 0, 0, 0, 1, 2, 3, 4,
  ]);
  assert.deepEqual(
    [...canvasPixels(raw, 2, 2)],
    [0, 0, 0, 0, 64, 128, 191, 4, 128, 191, 223, 128, 10, 20, 30, 255],
  );
  assert.equal(Math.round((canvasPixels(raw, 2, 2)[8] * 128) / 255), 64);
  assert.deepEqual(
    [...raw],
    [64, 96, 112, 128, 10, 20, 30, 255, 0, 0, 0, 0, 1, 2, 3, 4],
  );
  assert.throws(() => canvasPixels(raw, 3, 2), /dimensions/);
});
