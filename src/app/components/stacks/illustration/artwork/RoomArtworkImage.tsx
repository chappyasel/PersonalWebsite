import type { ComponentPropsWithoutRef } from "react";

import { getRoomArtwork } from "./getRoomArtwork";
import type { RoomArtworkTheme, RoomArtworkViewport } from "./types";

export type RoomArtworkImageProps = Omit<
  ComponentPropsWithoutRef<"img">,
  "src" | "srcSet" | "width" | "height"
> & {
  unitIndex: number;
  theme?: RoomArtworkTheme | "system";
  viewport?: RoomArtworkViewport | "responsive";
  pictureClassName?: string;
  /** The shelf being looked at. Offscreen shelves stay mounted so travel never
   * remounts the row, but they queue behind the active one. */
  active?: boolean;
};

/** No client hooks, artwork imports or WebGL dependency. The browser chooses one source. */
export function RoomArtworkImage({
  unitIndex,
  theme = "system",
  viewport = "responsive",
  pictureClassName,
  alt = "",
  active = true,
  ...imageProps
}: RoomArtworkImageProps) {
  const fallback = getRoomArtwork(
    unitIndex,
    theme === "dark" ? "dark" : "light",
    viewport === "phone" ? "phone" : "desktop",
  );
  if (!fallback) return null;
  const views: RoomArtworkViewport[] =
    viewport === "responsive" ? ["phone", "desktop"] : [viewport];
  const themes: RoomArtworkTheme[] =
    theme === "system" ? ["dark", "light"] : [theme];
  return (
    <picture className={pictureClassName} data-room-artwork={fallback.unit}>
      {views.flatMap((view) =>
        themes.map((tone) => {
          const asset = getRoomArtwork(unitIndex, tone, view)!;
          const conditions = [
            ...(viewport === "responsive" && view === "phone"
              ? ["(width < 1200px) and (max-aspect-ratio: 3/4)"]
              : []),
            ...(theme === "system" ? [`(prefers-color-scheme: ${tone})`] : []),
          ];
          return (
            <source
              key={`${view}-${tone}`}
              media={conditions.join(" and ") || undefined}
              srcSet={asset.src}
              type="image/svg+xml"
              width={asset.viewBox[2]}
              height={asset.viewBox[3]}
            />
          );
        }),
      )}
      {/* SVG detail bytes are embedded; Next image optimization adds no value here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        decoding="async"
        loading={active ? "eager" : "lazy"}
        fetchPriority={active ? "high" : "low"}
        {...imageProps}
        src={fallback.src}
        width={fallback.viewBox[2]}
        height={fallback.viewBox[3]}
        alt={alt}
      />
    </picture>
  );
}
