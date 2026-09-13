import assert from "node:assert/strict";
import test from "node:test";

import { channelValue, fitChannel, transferPixels } from "./color-transfer.mjs";

test("recovers a warm darkening curve despite sparse bright outliers", () => {
  const samples = Array.from({ length: 240 }, (_, i) => [
    i + 8,
    channelValue(i + 8, { gain: 0.9, gamma: 1.8 }) + (i % 11 === 0 ? 55 : 0),
  ]);
  const fit = fitChannel(samples);
  for (const x of [32, 64, 100, 160, 220])
    assert.ok(
      Math.abs(
        channelValue(x, fit) - channelValue(x, { gain: 0.9, gamma: 1.8 }),
      ) < 3,
    );
});
test("sparse evidence leaves a texture unchanged", () => {
  assert.deepEqual(fitChannel([[100, 30]]), { gain: 1, gamma: 1 });
});
test("pointwise transfer preserves alpha and darkens antialiased edges", () => {
  const source = Buffer.from([
    180, 160, 140, 255, 180, 160, 140, 80, 0, 0, 0, 0,
  ]);
  const curves = Array.from({ length: 3 }, () => ({ gain: 0.8, gamma: 1.5 }));
  const next = transferPixels(source, curves);
  assert.deepEqual([next[3], next[7], next[11]], [255, 80, 0]);
  assert.deepEqual([...next.subarray(0, 3)], [...next.subarray(4, 7)]);
  assert.ok(next[4] < source[4]);
  assert.equal(source[4], 180, "Input bytes are immutable");
});
test("fitted curves are monotone and preserve black ink", () => {
  const curve = fitChannel(
    Array.from({ length: 255 }, (_, x) => [x, Math.min(255, x * 0.6)]),
  );
  assert.equal(channelValue(0, curve), 0);
  for (let x = 1; x < 256; x++)
    assert.ok(channelValue(x, curve) >= channelValue(x - 1, curve));
});
