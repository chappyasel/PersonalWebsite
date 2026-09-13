import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { UNIT_COUNT } from "../data";

import { getRoomArtwork } from "./artwork/getRoomArtwork";
import type { RoomArtworkTheme, RoomArtworkViewport } from "./artwork/types";
import { artworkFrame } from "./artworkFrame";

/** Space the drawings by their projected bounds, while each selected stop
 * still places its artwork at the ordinary camera's exact viewport frame. */
export function illustrationTravelStops(
  width: number,
  height: number,
  railRight: number,
  theme: RoomArtworkTheme,
  viewport: RoomArtworkViewport,
) {
  const gap = Math.min(96, Math.max(48, width / 15));
  const frames = Array.from({ length: UNIT_COUNT }, (_, unit) =>
    artworkFrame(
      getRoomArtwork(unit, theme, viewport),
      aboutBootStageForViewport(
        width,
        height,
        railRight,
        ABOUT_BOOT_STAGE_GEOMETRY,
        unit,
      ),
      width,
      height,
    ),
  );
  let scrollLeft = 0;
  return frames.map((frame, position) => {
    const next = frames[position + 1];
    // A viewport-wide final slot lets the last shelf reach its camera frame.
    const slotWidth = next
      ? Math.max(1, frame.x + frame.width - next.x + gap)
      : width;
    const stop = { position, scrollLeft, width: slotWidth };
    scrollLeft += slotWidth;
    return stop;
  });
}
