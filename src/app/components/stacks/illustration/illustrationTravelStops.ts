import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { UNIT_COUNT } from "../data";
import { STACKS_DESKTOP_MIN_WIDTH, unitPose } from "../scene/worldLayout";

import { getRoomArtwork } from "./artwork/getRoomArtwork";
import type { RoomArtworkTheme, RoomArtworkViewport } from "./artwork/types";
import { artworkFrame } from "./artworkFrame";

export const ILLUSTRATION_POSITIONS = Array.from(
  { length: UNIT_COUNT },
  (_, i) => i,
);

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
  const stages = ILLUSTRATION_POSITIONS.map((unit) =>
    aboutBootStageForViewport(
      width,
      height,
      railRight,
      ABOUT_BOOT_STAGE_GEOMETRY,
      unit,
    ),
  );
  const frames = stages.map((stage, unit) =>
    artworkFrame(
      getRoomArtwork(ILLUSTRATION_POSITIONS[unit]!, theme, viewport),
      stage,
      width,
      height,
    ),
  );
  // About's authored camera position is a navigation stop, not the scroll
  // boundary. Leave enough leading space to reveal its left side beyond it,
  // including the area covered by the desktop rail.
  const leftInset = (width >= STACKS_DESKTOP_MIN_WIDTH ? railRight : 0) + 24;
  let scrollLeft = Math.max(0, Math.ceil(leftInset - frames[0]!.x));
  return frames.map((frame, index) => {
    const position = ILLUSTRATION_POSITIONS[index]!;
    const next = frames[index + 1];
    // A viewport-wide final slot lets the last shelf reach its camera frame.
    // Average the two resting camera scales for a continuous desktop row.
    const stage = stages[index]!;
    const nextStage = stages[index + 1];
    const slotWidth =
      !next || !nextStage
        ? width
        : width >= STACKS_DESKTOP_MIN_WIDTH
          ? ((unitPose(ILLUSTRATION_POSITIONS[index + 1]!).position[0] -
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

/** Preserve fractional scene positions despite unequal distances between drawings. */
export function illustratedScrollForPosition(
  stops: readonly { position: number; scrollLeft: number }[],
  position: number,
) {
  if (!stops.length) return 0;
  const last = stops[stops.length - 1]!;
  if (position <= stops[0]!.position) return stops[0]!.scrollLeft;
  for (let i = 1; i < stops.length; i++) {
    const right = stops[i]!;
    const left = stops[i - 1]!;
    if (position <= right.position)
      return (
        left.scrollLeft +
        ((right.scrollLeft - left.scrollLeft) * (position - left.position)) /
          (right.position - left.position)
      );
  }
  return last.scrollLeft;
}

export function positionForIllustratedScroll(
  stops: readonly { position: number; scrollLeft: number }[],
  scrollLeft: number,
) {
  if (!stops.length) return 0;
  if (scrollLeft <= stops[0]!.scrollLeft) return stops[0]!.position;
  for (let i = 1; i < stops.length; i++) {
    const right = stops[i]!;
    const left = stops[i - 1]!;
    if (scrollLeft <= right.scrollLeft)
      return (
        left.position +
        ((right.position - left.position) * (scrollLeft - left.scrollLeft)) /
          (right.scrollLeft - left.scrollLeft)
      );
  }
  return stops[stops.length - 1]!.position;
}
