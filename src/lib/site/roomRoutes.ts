/**
 * The paths that render the homepage room.
 *
 * A hash never reaches the server, so every `/#projects` link used to unfurl
 * as the homepage card. A shelf that owns a path can carry its own title,
 * description, and card, the way `/golf` always has. Books, Weightlifting,
 * and Systems are real pages at those paths, so their stops keep the hash
 * form. About's stop is the homepage itself: `/about` opens there, but the
 * stop's canonical URL stays `/`.
 *
 * Dependency-free on purpose. The scene registry, the history wiring, the
 * route-transition prototype, and Universal Search all need the same answer
 * to "is this pathname the room?", and none of them should pull in the
 * others to ask it.
 */
export const ROOM_HOME_PATHNAME = "/";
export const GOLF_PATHNAME = "/golf";

/** Public URL slug → pathname, for the shelves that own a path. */
export const ROOM_SECTION_PATHNAMES: Readonly<Record<string, string>> = {
  about: "/about",
  projects: "/projects",
  musings: "/musings",
  talks: "/talks",
};

export function normalizeRoomPathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** The public URL slug whose shelf a pathname opens on, or null. */
export function roomSectionSlugForPathname(pathname: string): string | null {
  const normalized = normalizeRoomPathname(pathname);
  for (const [slug, sectionPathname] of Object.entries(
    ROOM_SECTION_PATHNAMES,
  )) {
    if (sectionPathname === normalized) return slug;
  }
  return null;
}

/** Whether a pathname renders the room: the homepage, the golf stop, or a
 * shelf's own path. Reading pages (`/books`, `/manual`, ...) are not. */
export function isRoomPathname(pathname: string) {
  const normalized = normalizeRoomPathname(pathname);
  return (
    normalized === ROOM_HOME_PATHNAME ||
    normalized === GOLF_PATHNAME ||
    roomSectionSlugForPathname(normalized) !== null
  );
}
