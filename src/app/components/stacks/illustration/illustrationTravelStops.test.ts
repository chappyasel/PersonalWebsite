import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { RAIL_RIGHT_PX_FALLBACK } from "../scene/worldLayout";
import { expect, it } from "vitest";

import { getRoomArtwork } from "./artwork/getRoomArtwork";
import { artworkFrame } from "./artworkFrame";
import { illustrationTravelStops } from "./illustrationTravelStops";

it.each([
  { width: 390, height: 844, gap: 48, viewport: "phone" as const },
  { width: 1440, height: 900, gap: 96, viewport: "desktop" as const },
  { width: 2560, height: 1440, gap: 96, viewport: "desktop" as const },
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
      expect(stops[0]!.scrollLeft).toBe(0);
      expect(stops.at(-1)!.width).toBe(width);
    }
  },
);
