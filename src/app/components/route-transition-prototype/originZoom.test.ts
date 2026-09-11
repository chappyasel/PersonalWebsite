import { expect, it } from "vitest";

import { originZoomGeometry } from "./originZoom";

it("reveals from the clicked box with a small push anchored to its centre", () => {
  const result = originZoomGeometry(
    { left: 100, top: 200, width: 400, height: 300 },
    1200,
    900,
  );
  const [x, y, scale] = result.zoom.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  expect(scale).toBe(1.2);
  expect(x! + 300 * scale!).toBeCloseTo(300);
  expect(y! + 350 * scale!).toBeCloseTo(350);
  expect(result.clip).toBe("inset(200px 700px 400px 100px round 16px)");
  expect(result.panel).toBe(
    "translate(100px, 200px) scale(0.3333333333333333, 0.3333333333333333)",
  );
});
it("does not magnify tiny sources more than large cards", () => {
  const result = originZoomGeometry(
    { left: 100, top: 200, width: 1, height: 1 },
    1200,
    900,
  );
  expect(result.zoom).toContain("scale(1.2)");
  expect(result.clip).toBe("inset(200px 1099px 699px 100px round 0.5px)");
});
it("uses the visible part of a clipped source", () => {
  expect(
    originZoomGeometry(
      { left: -100, top: 100, width: 300, height: 200 },
      1200,
      900,
    ).rect,
  ).toEqual({ left: 0, top: 100, width: 200, height: 200 });
});
it.each([
  { left: 0, top: 0, width: 0, height: 0 },
  { left: 2000, top: 0, width: 100, height: 100 },
  { left: NaN, top: 0, width: 100, height: 100 },
])("handles an unavailable source without invalid transforms", (source) => {
  const result = originZoomGeometry(source, 1200, 900);
  expect(result.rect).toEqual({ left: 520, top: 390, width: 160, height: 120 });
  expect(result.zoom).not.toContain("NaN");
});
