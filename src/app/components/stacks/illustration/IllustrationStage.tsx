"use client";

import { GOLF_STOP_POSITION, type StacksData, UNITS } from "../data";
import { BootScreenArtwork } from "../dom/BootScreen";
import type { BootReadingBook } from "../dom/bootReadingBooks";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

import type { ReadingBookEdgeColor } from "~/lib/books/coverEdgeColor";

import { GolfIllustration } from "./GolfIllustration";
import { IllustrationFrame } from "./IllustrationFrame";
import {
  RoomArtworkImage,
  type RoomArtworkTheme,
  type RoomArtworkViewport,
  getRoomArtwork,
} from "./artwork";
import "./illustratedRoom.css";

const IllustrationHotspots = dynamic(() =>
  import("./IllustrationHotspots").then(
    (module) => module.IllustrationHotspots,
  ),
);

export type IllustrationStageProps = {
  unitIndex: number;
  interactionData?: StacksData;
  theme?: RoomArtworkTheme | "system";
  viewport?: RoomArtworkViewport | "responsive";
  readingBooks?: BootReadingBook[];
  readingBookColors?: Record<string, ReadingBookEdgeColor>;
  unavailable?: boolean;
  shelfOnly?: boolean;
  /** Emit the pre-paint geometry script. First-paint shell frames only. */
  prepaint?: boolean;
  /** The shelf the visitor is looking at. Offscreen shelves stay mounted for
   * travel, so they yield their image bandwidth and decode budget instead. */
  active?: boolean;
};

/** Shared first-paint/hydrated geometry. Registration markers belong to its client owner. */
export function IllustrationStage({
  unitIndex,
  interactionData,
  theme = "system",
  viewport = "responsive",
  readingBooks,
  readingBookColors,
  unavailable = false,
  shelfOnly = false,
  prepaint = false,
  active = true,
}: IllustrationStageProps) {
  if (unitIndex === GOLF_STOP_POSITION)
    return (
      <div className="room-illustration-stage room-golf-stage">
        <GolfIllustration />
      </div>
    );
  const tone = theme === "dark" ? "dark" : "light";
  const desktop = getRoomArtwork(unitIndex, tone, "desktop");
  const phone = getRoomArtwork(unitIndex, tone, "phone");
  const displayWidth = (asset: typeof desktop) =>
    asset ? (500 * asset.viewBox[2]!) / asset.drawingWidth : 500;
  return (
    <IllustrationFrame
      unitIndex={unitIndex}
      emptyAbout={shelfOnly && unitIndex === 0}
      prepaint={prepaint}
      style={
        {
          "--room-artwork-desktop-width": `${displayWidth(desktop)}px`,
          "--room-artwork-phone-width": `${displayWidth(phone)}px`,
          "--room-artwork-desktop-ratio": desktop
            ? desktop.viewBox[2]! / desktop.viewBox[3]!
            : 300 / 230,
          "--room-artwork-phone-ratio": phone
            ? phone.viewBox[2]! / phone.viewBox[3]!
            : 300 / 230,
          "--room-empty-desktop-image": desktop
            ? `var(--room-shelf-${unitIndex}-${tone}-desktop, url("${desktop.shelfSrc}"))`
            : "none",
          "--room-empty-phone-image": phone
            ? `var(--room-shelf-${unitIndex}-${tone}-phone, url("${phone.shelfSrc}"))`
            : "none",
        } as CSSProperties
      }
    >
      {(camera) => (
        <>
          {unitIndex === 0 ? (
            <div className="room-illustration-about">
              <BootScreenArtwork
                readingBooks={readingBooks}
                readingBookColors={readingBookColors}
                camera={camera}
                shelfOnly={shelfOnly}
                ditherActive={Boolean(interactionData)}
              />
            </div>
          ) : desktop && !unavailable ? (
            <RoomArtworkImage
              unitIndex={unitIndex}
              theme={theme}
              viewport={viewport}
              active={active}
              data-illustration-image=""
              pictureClassName="room-illustration-picture"
              alt={`${UNITS[unitIndex]?.label ?? "Room"} shelf illustration`}
            />
          ) : (
            <p className="room-illustration-unavailable" role="status">
              The illustration is unavailable. You can still read this section.
            </p>
          )}
          {interactionData && !unavailable && (
            <IllustrationHotspots
              unit={unitIndex}
              data={interactionData}
              theme={tone}
              viewport={viewport === "phone" ? "phone" : "desktop"}
              camera={camera}
            />
          )}
        </>
      )}
    </IllustrationFrame>
  );
}
