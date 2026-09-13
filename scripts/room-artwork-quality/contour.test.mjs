import assert from "node:assert/strict";
import { test } from "node:test";

import { traceContour } from "./contour.mjs";

const mask = (width, height, predicate) =>
  Uint8Array.from({ length: width * height }, (_, i) =>
    predicate((i % width) + 0.5, Math.floor(i / width) + 0.5) ? 255 : 0,
  );
function pathSamples(path) {
  const tokens = path.match(/[MLCZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const points = [];
  let previous = [0, 0],
    i = 0;
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "Z") continue;
    if (command === "M" || command === "L") {
      previous = [+tokens[i++], +tokens[i++]];
      points.push(previous);
    } else if (command === "C") {
      const b = [+tokens[i++], +tokens[i++]],
        c = [+tokens[i++], +tokens[i++]],
        d = [+tokens[i++], +tokens[i++]];
      for (let j = 1; j <= 20; j++) {
        const t = j / 20,
          u = 1 - t;
        points.push(
          [0, 1].map(
            (a) =>
              u ** 3 * previous[a] +
              3 * u ** 2 * t * b[a] +
              3 * u * t ** 2 * c[a] +
              t ** 3 * d[a],
          ),
        );
      }
      previous = d;
    } else throw new Error(`Unexpected command ${command}`);
  }
  return points;
}
test("diagonal manufactured corners remain sharp, deterministic and within subpixel contour error", () => {
  const input = {
    width: 160,
    height: 160,
    scale: 4,
    alpha: mask(160, 160, (x, y) => Math.abs(x - 80) + Math.abs(y - 80) < 48),
  };
  const path = traceContour(input);
  assert.equal(path, traceContour(input));
  assert.equal(
    path.includes("C"),
    false,
    "straight diamond edges must not become curves",
  );
  for (const [x, y] of pathSamples(path))
    assert.ok(Math.abs(Math.abs(x - 20) + Math.abs(y - 20) - 12) <= 0.26);
  for (const corner of [
    [20, 8],
    [32, 20],
    [20, 32],
    [8, 20],
  ])
    assert.ok(
      pathSamples(path).some(
        (p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) <= 0.36,
      ),
    );
});
test("organic silhouette uses curves without exceeding capture quantization plus fitting error", () => {
  const path = traceContour({
    width: 240,
    height: 240,
    scale: 4,
    alpha: mask(240, 240, (x, y) => Math.hypot(x - 120, y - 120) < 85),
  });
  assert.ok(
    path.includes("C"),
    "the fitted circle must contain actual curve commands",
  );
  for (const [x, y] of pathSamples(path))
    assert.ok(Math.abs(Math.hypot(x - 30, y - 30) - 21.25) <= 0.4);
});
test("holes, one-pixel islands and diagonally touching components survive with independent closed loops", () => {
  const path = traceContour({
    width: 80,
    height: 80,
    scale: 4,
    offset: [5, 9],
    alpha: mask(
      80,
      80,
      (x, y) =>
        (Math.hypot(x - 40, y - 40) < 25 && Math.hypot(x - 40, y - 40) > 13) ||
        (x < 1 && y < 1) ||
        (x > 1 && x < 2 && y > 1 && y < 2),
    ),
  });
  assert.equal((path.match(/M/g) ?? []).length, 4);
  assert.equal((path.match(/Z/g) ?? []).length, 4);
  assert.ok(pathSamples(path).some(([x, y]) => x === 5 && y === 9));
});
test("binary masks and alpha masks agree; empty masks stay empty and malformed inputs fail", () => {
  const alpha = mask(12, 12, (x, y) => x > 3 && x < 8 && y > 3 && y < 8);
  assert.equal(
    traceContour({ alpha, width: 12, height: 12 }),
    traceContour({
      alpha: alpha.map((x) => (x ? 1 : 0)),
      width: 12,
      height: 12,
    }),
  );
  assert.equal(
    traceContour({ alpha: new Uint8Array(4), width: 2, height: 2 }),
    "",
  );
  assert.throws(
    () => traceContour({ alpha, width: 11, height: 12 }),
    /Invalid/,
  );
});
