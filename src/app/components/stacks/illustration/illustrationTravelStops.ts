import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { UNIT_COUNT } from "../data";
import { STACKS_DESKTOP_MIN_WIDTH, unitPose } from "../scene/worldLayout";

import { getRoomArtwork } from "./artwork/getRoomArtwork";
import type { RoomArtworkTheme, RoomArtworkViewport } from "./artwork/types";
import { artworkFrame } from "./artworkFrame";

/** Desktop preserves scene spacing; narrow layouts tuck the artwork closer.
 * Each selected stop retains its exact ordinary-camera viewport frame. */
export function illustrationTravelStops(
  width: number,
  height: number,
  railRight: number,
  theme: RoomArtworkTheme,
  viewport: RoomArtworkViewport,
) {
  const gap = Math.min(96, Math.max(48, width / 15));
  const stages = Array.from({ length: UNIT_COUNT }, (_, unit) =>
    aboutBootStageForViewport(
      width,
      height,
      railRight,
      ABOUT_BOOT_STAGE_GEOMETRY,
      unit,
    ),
  );
  const frames = stages.map((stage, unit) =>
    artworkFrame(getRoomArtwork(unit, theme, viewport), stage, width, height),
  );
  let scrollLeft = 0;
  return frames.map((frame, position) => {
    const next = frames[position + 1];
    // A viewport-wide final slot lets the last shelf reach its camera frame.
    // Average the two resting camera scales for a continuous desktop row.
    const stage = stages[position]!;
    const nextStage = stages[position + 1];
    const slotWidth =
      !next || !nextStage
        ? width
        : width >= STACKS_DESKTOP_MIN_WIDTH
          ? ((unitPose(position + 1).position[0] -
              unitPose(position).position[0]) *
              (stage.unitPx + nextStage.unitPx)) /
              2 +
            stage.originX -
            nextStage.originX
          : Math.max(1, frame.x + frame.width - next.x + gap);
    const stop = { position, scrollLeft, width: slotWidth };
    scrollLeft += slotWidth;
    return stop;
  });
}
