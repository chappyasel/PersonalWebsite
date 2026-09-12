import BootScreen from "../dom/BootScreen";
import type { CSSProperties } from "react";

import {
  IllustrationStage,
  type IllustrationStageProps,
} from "./IllustrationStage";
import { getRoomArtwork } from "./artwork/getRoomArtwork";
import "./roomBootShell.css";

type RoomBootShellProps = Pick<
  IllustrationStageProps,
  "unitIndex" | "readingBooks" | "readingBookColors"
> & { illustrated: boolean };

/** CSS reads the theme class established before body content, so the page stays cacheable. */
function FirstPaintArtwork(props: Omit<RoomBootShellProps, "illustrated">) {
  const fallback = getRoomArtwork(props.unitIndex, "light", "desktop");
  if (!fallback) return <IllustrationStage {...props} />;
  const style: Record<string, string> = {};
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of ["desktop", "phone"] as const) {
      const asset =
        getRoomArtwork(props.unitIndex, theme, viewport) ?? fallback;
      const prefix = `--room-first-paint-${theme}-${viewport}`;
      style[`${prefix}-image`] = `url("${asset.src}")`;
      style[`${prefix}-width`] =
        `${(500 * asset.viewBox[2]!) / asset.drawingWidth}px`;
      style[`${prefix}-ratio`] = String(asset.viewBox[2]! / asset.viewBox[3]!);
    }
  }
  return (
    <div className="room-illustration-stage" style={style as CSSProperties}>
      <div
        className="room-first-paint-artwork"
        role="img"
        aria-label={`${fallback.unit} shelf illustration`}
      />
    </div>
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
    <div className="room-first-paint room-illustration" aria-hidden>
      <FirstPaintArtwork {...props} />
      <span className="room-first-paint-name">Chappy Asel</span>
    </div>
  );
}
