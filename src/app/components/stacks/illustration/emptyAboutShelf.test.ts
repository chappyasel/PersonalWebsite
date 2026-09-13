import { SCENE_TO_BOOT_SVG } from "../dom/bootVignette";
import {
  aboutBootPlankProjection,
  aboutBootRestCamera,
} from "../scene/aboutBootPerspective";
import { aboutBootShelfSupportProjection } from "../scene/aboutBootSupportProjection";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

import { emptyAboutShelf } from "./emptyAboutShelf";

it.each([
  [390, 844],
  [430, 932],
  [820, 1180],
  [1024, 768],
  [1200, 900],
  [1440, 900],
  [2560, 1440],
  [3440, 1440],
  [3840, 1080],
])(
  "projects About's first-paint wood through the same camera at %i x %i",
  (width, height) => {
    const camera = aboutBootRestCamera(width, height);
    const output = emptyAboutShelf(
      camera,
      SHELF_PLANKS,
      SHELF_GEOMETRY,
      SCENE_TO_BOOT_SVG,
    );
    const standalone: unknown = runInNewContext(
      `(${emptyAboutShelf.toString()})(camera,planks,geometry,scale)`,
      {
        camera,
        planks: SHELF_PLANKS,
        geometry: SHELF_GEOMETRY,
        scale: SCENE_TO_BOOT_SVG,
      },
    );
    expect(JSON.stringify(standalone)).toBe(JSON.stringify(output));
    for (const [index, plank] of SHELF_PLANKS.entries()) {
      const expected = aboutBootPlankProjection(plank, camera);
      for (const face of ["top", "front"] as const) {
        const actual = output.faces[index]![face].split(/[ ,]/).map(Number);
        expected[face]
          .flatMap(([x, y]) => [x * SCENE_TO_BOOT_SVG, -y * SCENE_TO_BOOT_SVG])
          .forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 3));
      }
      for (const side of ["left", "right"] as const) {
        expect(output.faces[index]![side].visible).toBe(expected[side].visible);
        const actual =
          output.faces[index]![side].points.split(/[ ,]/).map(Number);
        expected[side].points
          .flatMap(([x, y]) => [x * SCENE_TO_BOOT_SVG, -y * SCENE_TO_BOOT_SVG])
          .forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 3));
      }
    }
    for (const support of output.supports) {
      const expected = aboutBootShelfSupportProjection(
        support.side as -1 | 1,
        camera,
      );
      for (const part of ["upright", "foot"] as const) {
        for (const face of Object.keys(
          expected[part].faces,
        ) as (keyof typeof expected.upright.faces)[]) {
          expect(support[part].faces[face].visible).toBe(
            expected[part].faces[face].visible,
          );
          const actual = support[part].faces[face].points
            .split(/[ ,]/)
            .map(Number);
          expected[part].faces[face].points
            .flatMap(([x, y]) => [
              x * SCENE_TO_BOOT_SVG,
              -y * SCENE_TO_BOOT_SVG,
            ])
            .forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 3));
        }
        expect(support[part].x).toBeCloseTo(
          expected[part].x * SCENE_TO_BOOT_SVG,
          3,
        );
        expect(support[part].y).toBeCloseTo(
          -expected[part].top * SCENE_TO_BOOT_SVG,
          3,
        );
        expect(support[part].width).toBeCloseTo(
          expected[part].width * SCENE_TO_BOOT_SVG,
          3,
        );
        expect(support[part].height).toBeCloseTo(
          (expected[part].top - expected[part].bottom) * SCENE_TO_BOOT_SVG,
          3,
        );
      }
    }
  },
);
