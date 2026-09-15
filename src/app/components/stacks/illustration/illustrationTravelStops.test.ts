import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { RAIL_RIGHT_PX_FALLBACK, unitPose } from "../scene/worldLayout";
import { expect, it } from "vitest";

import { getRoomArtwork } from "./artwork/getRoomArtwork";
import { artworkFrame } from "./artworkFrame";
import { illustrationTravelStops } from "./illustrationTravelStops";

it.each([
  { width: 390, height: 844, gap: 48, viewport: "phone" as const },
  { width: 1024, height: 768, gap: 1024 / 15, viewport: "desktop" as const },
])(
  "leaves $gap pixels between actual artwork frames at $width, with the last stop reachable",
  ({ width, height, gap, viewport }) => {
    for (const theme of ["light", "dark"] as const) {
      const stops = illustrationTravelStops(
        width,
        height,
        RAIL_RIGHT_PX_FALLBACK,
        theme,
        viewport,
      );
      const boxes = stops.map(({ position, scrollLeft }) => {
        const frame = artworkFrame(
          getRoomArtwork(position, theme, viewport),
          aboutBootStageForViewport(
            width,
            height,
            RAIL_RIGHT_PX_FALLBACK,
            ABOUT_BOOT_STAGE_GEOMETRY,
            position,
          ),
          width,
          height,
        );
        return {
          left: scrollLeft + frame.x,
          right: scrollLeft + frame.x + frame.width,
        };
      });
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i]!.left - boxes[i - 1]!.right).toBeCloseTo(gap, 5);
        expect(stops[i]!.scrollLeft).toBeGreaterThan(stops[i - 1]!.scrollLeft);
      }
      expect(stops[0]!.scrollLeft).toBeGreaterThanOrEqual(0);
      expect(stops.at(-1)!.width).toBe(width);
    }
  },
);

it.each([
  [1200, 900],
  [1440, 900],
  [390, 844],
])(
  "allows the entire About frame to clear the left edge at %i x %i",
  (width, height) => {
    const viewport = width < 600 ? "phone" : "desktop";
    const stops = illustrationTravelStops(
      width,
      height,
      RAIL_RIGHT_PX_FALLBACK,
      "light",
      viewport,
    );
    const frame = artworkFrame(
      null,
      aboutBootStageForViewport(
        width,
        height,
        RAIL_RIGHT_PX_FALLBACK,
        ABOUT_BOOT_STAGE_GEOMETRY,
        0,
      ),
      width,
      height,
    );
    const left = stops[0]!.scrollLeft + frame.x;
    expect(left).toBeGreaterThanOrEqual(
      (width >= 1200 ? RAIL_RIGHT_PX_FALLBACK : 0) + 24,
    );
  },
);

it.each([
  [1200, 900],
  [1440, 900],
  [2560, 1440],
])("preserves physical unit spacing on desktop at %i x %i", (width, height) => {
  const stops = illustrationTravelStops(
    width,
    height,
    RAIL_RIGHT_PX_FALLBACK,
    "light",
    "desktop",
  );
  const stages = stops.map(({ position }) =>
    aboutBootStageForViewport(
      width,
      height,
      RAIL_RIGHT_PX_FALLBACK,
      ABOUT_BOOT_STAGE_GEOMETRY,
      position,
    ),
  );
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!.scrollLeft + stages[i]!.originX;
    const to = stops[i + 1]!.scrollLeft + stages[i + 1]!.originX;
    const pixelsPerUnit = (stages[i]!.unitPx + stages[i + 1]!.unitPx) / 2;
    expect((to - from) / pixelsPerUnit).toBeCloseTo(
      unitPose(stops[i + 1]!.position).position[0] -
        unitPose(stops[i]!.position).position[0],
      8,
    );
  }
  expect(stops.at(-1)!.width).toBe(width);
  expect(
    illustrationTravelStops(
      width,
      height,
      RAIL_RIGHT_PX_FALLBACK,
      "dark",
      "desktop",
    ),
  ).toEqual(stops);
});
