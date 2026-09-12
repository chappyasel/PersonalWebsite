import { UNITS } from "../data";
import { BootScreenArtwork } from "../dom/BootScreen";
import type { BootReadingBook } from "../dom/bootReadingBooks";
import type { CSSProperties } from "react";

import type { ReadingBookEdgeColor } from "~/lib/books/coverEdgeColor";

import {
  RoomArtworkImage,
  type RoomArtworkTheme,
  type RoomArtworkViewport,
  getRoomArtwork,
} from "./artwork";
import "./illustratedRoom.css";

export type IllustrationStageProps = {
  unitIndex: number;
  theme?: RoomArtworkTheme | "system";
  viewport?: RoomArtworkViewport | "responsive";
  readingBooks?: BootReadingBook[];
  readingBookColors?: Record<string, ReadingBookEdgeColor>;
  unavailable?: boolean;
};

/** Shared first-paint/hydrated geometry. Registration markers belong to its client owner. */
export function IllustrationStage({
  unitIndex,
  theme = "system",
  viewport = "responsive",
  readingBooks,
  readingBookColors,
  unavailable = false,
}: IllustrationStageProps) {
  const tone = theme === "dark" ? "dark" : "light";
  const desktop = getRoomArtwork(unitIndex, tone, "desktop");
  const phone = getRoomArtwork(unitIndex, tone, "phone");
  const displayWidth = (asset: typeof desktop) =>
    asset ? (500 * asset.viewBox[2]!) / asset.drawingWidth : 500;
  return (
    <div
      className="room-illustration-stage"
      style={
        {
          "--room-artwork-desktop-width": `${displayWidth(desktop)}px`,
          "--room-artwork-phone-width": `${displayWidth(phone)}px`,
        } as CSSProperties
      }
    >
      {unitIndex === 0 ? (
        <div className="room-illustration-about">
          <BootScreenArtwork
            readingBooks={readingBooks}
            readingBookColors={readingBookColors}
          />
        </div>
      ) : desktop && !unavailable ? (
        <RoomArtworkImage
          unitIndex={unitIndex}
          theme={theme}
          viewport={viewport}
          data-illustration-image=""
          pictureClassName="room-illustration-picture"
          alt={`${UNITS[unitIndex]?.label ?? "Room"} shelf illustration`}
        />
      ) : (
        <p className="room-illustration-unavailable" role="status">
          The illustration is unavailable. You can still read this section.
        </p>
      )}
    </div>
  );
}
