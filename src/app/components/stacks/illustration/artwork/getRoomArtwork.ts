import catalog from "./catalog.json";
import type {
  RoomArtworkMetadata,
  RoomArtworkTheme,
  RoomArtworkViewport,
} from "./types";

/** About stays with BootScreenArtwork. Fractional destinations have no shelf image. */
export function getRoomArtwork(
  unitIndex: number,
  theme: RoomArtworkTheme,
  viewport: RoomArtworkViewport,
): RoomArtworkMetadata | null {
  if (!Number.isInteger(unitIndex)) return null;
  return (
    (catalog as unknown as Record<string, RoomArtworkMetadata>)[
      `${unitIndex}/${theme}-${viewport}`
    ] ?? null
  );
}
