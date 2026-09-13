import {
  ABOUT_BOOT_CAMERA,
  aboutBootWorldPoint,
  projectAboutBootPoint,
} from "../scene/aboutBootPerspective";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { aboutIllustrationProjection } from "./aboutProjection";
import { artworkPoint, cssPoint, rebaseProjection } from "./projection";

describe("illustrated room camera projection", () => {
  it.each([
    {
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      box: { x: 215, y: 220, width: 540, height: 414 },
    },
    {
      viewport: { x: 0, y: 0, width: 390, height: 844 },
      box: { x: 18, y: 100, width: 354, height: 271.4 },
    },
    {
      viewport: { x: 40, y: 25, width: 900, height: 660 },
      box: { x: 87, y: 143, width: 396, height: 303.6 },
    },
  ])(
    "matches the original About projector in a $viewport.width px viewport",
    ({ box, viewport }) => {
      const { world, projection } = aboutIllustrationProjection(box, viewport);
      for (const point of [
        [-1.3, 0, -0.4],
        [1.3, 0, 0.4],
        [-1.3, -0.87, 0.2],
        [1.3, -0.87, -0.4],
        [0, 0.68, 0.13],
        [-0.55, -0.8, 0.15],
      ] as const) {
        const projected = projectAboutBootPoint(point);
        const expected = artworkPoint(
          [projected.x * 100, -projected.y * 100],
          [-150, -108, 300, 230],
          box,
        );
        const actual = cssPoint(
          new Vector3(...aboutBootWorldPoint(point, ABOUT_BOOT_CAMERA.unitYaw)),
          world,
          projection,
          viewport,
        );
        expect(
          Math.hypot(expected[0]! - actual[0]!, expected[1]! - actual[1]!),
        ).toBeLessThan(0.00001);
      }
    },
  );

  it("preserves captured perspective and view offsets in a cropped image", () => {
    const capture = new PerspectiveCamera(37, 1440 / 900, 0.1, 100);
    capture.position.set(18, 2, 7);
    capture.lookAt(17, 0.1, -0.3);
    capture.setViewOffset(1600, 1000, 80, 50, 1440, 900);
    capture.updateMatrixWorld(true);
    const raster = [1440, 900];
    const crop = [181, 123, 849, 602];
    const box = { x: 39, y: 142, width: 344, height: 260 };
    const viewport = { x: 0, y: 0, width: 430, height: 932 };
    const projection = rebaseProjection(
      capture.projectionMatrix.elements,
      raster,
      crop,
      box,
      viewport,
    );
    const before = capture.projectionMatrix.clone();
    for (const point of [
      new Vector3(16, 0, -0.4),
      new Vector3(18, -0.8, 0.6),
      new Vector3(17.5, 0.7, 0),
    ]) {
      const pixel = cssPoint(
        point,
        capture.matrixWorld,
        capture.projectionMatrix,
        { x: 0, y: 0, width: 1440, height: 900 },
      );
      const expected = artworkPoint(pixel, crop, box);
      const actual = cssPoint(point, capture.matrixWorld, projection, viewport);
      expect(
        Math.hypot(expected[0]! - actual[0]!, expected[1]! - actual[1]!),
      ).toBeLessThan(0.00001);
    }
    expect(capture.projectionMatrix.equals(before)).toBe(true);
    expect(projection).toBeInstanceOf(Matrix4);
  });
});
