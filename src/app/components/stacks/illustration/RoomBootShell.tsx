import { WORLD_BOOT_POLICY } from "../boot/worldBootPolicy";
import BootScreen from "../dom/BootScreen";
import type { CSSProperties } from "react";

import { IllustrationFrame } from "./IllustrationFrame";
import {
  IllustrationStage,
  type IllustrationStageProps,
} from "./IllustrationStage";
import { IllustrationStatus } from "./IllustrationStatus";
import { RoomFirstPaintSelection } from "./RoomFirstPaintSelection";
import { getRoomArtwork } from "./artwork/getRoomArtwork";
import shelves from "./artwork/shelves.generated.json";
import "./roomBootShell.css";

type RoomBootShellProps = Pick<
  IllustrationStageProps,
  "unitIndex" | "readingBooks" | "readingBookColors"
> & { illustrated: boolean };

/** CSS reads the theme class established before body content, so the page stays cacheable. */
function FirstPaintArtwork(props: Omit<RoomBootShellProps, "illustrated">) {
  const fallback = getRoomArtwork(props.unitIndex, "light", "desktop");
  if (!fallback) return <IllustrationStage {...props} shelfOnly />;
  const style: Record<string, string> = {};
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of ["desktop", "phone"] as const) {
      const asset =
        getRoomArtwork(props.unitIndex, theme, viewport) ?? fallback;
      const prefix = `--room-first-paint-${theme}-${viewport}`;
      style[`${prefix}-image`] =
        `var(--room-shelf-${props.unitIndex}-${theme}-${viewport})`;
      style[`${prefix}-width`] =
        `${(500 * asset.viewBox[2]!) / asset.drawingWidth}px`;
      style[`${prefix}-ratio`] = String(asset.viewBox[2]! / asset.viewBox[3]!);
    }
  }
  return (
    <IllustrationFrame
      unitIndex={props.unitIndex}
      style={style as CSSProperties}
    >
      <div
        className="room-first-paint-artwork"
        role="img"
        aria-label={`${fallback.unit} shelf illustration`}
      />
    </IllustrationFrame>
  );
}

/** The shell streams before secondary room data. Hydrated UI takes over the same geometry. */
export default function RoomBootShell({
  illustrated,
  ...props
}: RoomBootShellProps) {
  if (!illustrated)
    return (
      <BootScreen
        readingBooks={props.readingBooks}
        readingBookColors={props.readingBookColors}
      />
    );
  return (
    <>
      <RoomFirstPaintSelection initialUnit={props.unitIndex} />
      <style>{`:root{--room-dissolve-duration:${WORLD_BOOT_POLICY.illustrationDissolveMs}ms;${Object.entries(
        shelves,
      )
        .map(
          ([key, image]) =>
            `--room-shelf-${key.replace("/", "-")}:url("${image}")`,
        )
        .join(";")}}`}</style>
      <div
        className="room-first-paint room-illustration"
        data-illustration-loading
        aria-hidden
      >
        {[0, 1, 1.52, 2, 3, 4, 5, 6].map((unitIndex) => (
          <div
            className="room-first-paint-unit"
            data-first-paint-unit={unitIndex}
            key={unitIndex}
          >
            <FirstPaintArtwork {...props} unitIndex={unitIndex} />
          </div>
        ))}
        <div className="room-illustration-actions">
          <IllustrationStatus loading firstPaint />
        </div>
      </div>
      {/* This survives the shell's hydration handoff, so its animation never restarts. */}
      <span className="room-entry-wordmark" aria-hidden>
        Chappy Asel
      </span>
    </>
  );
}
