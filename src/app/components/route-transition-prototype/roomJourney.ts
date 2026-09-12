import { isRoomPathname } from "~/lib/site/roomRoutes";

import { type OriginRect } from "./originZoom";

// Keep the original keys so existing in-document history entries still retrace.
const HISTORY_KEY = "__booksRoomJourney";
const SOURCE_ATTRIBUTE = "data-books-return-source";

export type RoomJourney = {
  id: string;
  source: { kind: "dom" | "scene"; id: string } | null;
  generation: number;
};

// Book details own their modal transitions. Other sections can launch a full
// document directly from the room, including nested Systems pages.
function isRoomDestination(path: string) {
  if (path === "/books") return true;
  return [
    "weightlifting",
    "manual",
    "routine",
    "systems",
    "liarsdice",
    "weight-log",
  ].includes(path.split("/")[1] ?? "");
}

/** `/`, `/golf`, and a shelf's own path are all the room: moving between
 * them is travel, not a journey. */
export function roomDirection(from: string, to: string) {
  const fromRoom = isRoomPathname(from);
  const toRoom = isRoomPathname(to);
  if (fromRoom && toRoom) return null;
  if (fromRoom && isRoomDestination(to)) return "enter";
  if (isRoomDestination(from) && toRoom) return "return";
  return null;
}

export function rememberRoomSource(
  source: HTMLElement | string | undefined,
  generation: number,
): RoomJourney {
  const journeyId = crypto.randomUUID();
  if (typeof source === "string")
    return { id: journeyId, generation, source: { kind: "scene", id: source } };
  if (!source) return { id: journeyId, generation, source: null };
  const id = source.getAttribute(SOURCE_ATTRIBUTE) ?? crypto.randomUUID();
  source.setAttribute(SOURCE_ATTRIBUTE, id);
  return { id: journeyId, generation, source: { kind: "dom", id } };
}

export function readRoomJourney(state: unknown): RoomJourney | null {
  if (!state || typeof state !== "object" || !(HISTORY_KEY in state))
    return null;
  const value = state[HISTORY_KEY] as RoomJourney | undefined;
  if (
    !value ||
    typeof value.id !== "string" ||
    !Number.isInteger(value.generation)
  )
    return null;
  if (
    value.source !== null &&
    (!value.source ||
      !["dom", "scene"].includes(value.source.kind) ||
      typeof value.source.id !== "string")
  )
    return null;
  return value;
}

/** Native scroll restoration precedes our delayed route restore. Keep a small
 * in-memory position per journey so Forward reveals each page where it was left.
 * Distinct visits through the same card must not overwrite each other.
 */
export class PageScrollMemory {
  private readonly positions = new Map<string, { left: number; top: number }>();

  save(journey: RoomJourney | null, left: number, top: number) {
    if (!journey) return;
    this.positions.delete(journey.id);
    this.positions.set(journey.id, { left, top });
    if (this.positions.size > 64)
      this.positions.delete(this.positions.keys().next().value!);
  }

  get(journey: RoomJourney | null) {
    return journey ? this.positions.get(journey.id) : undefined;
  }
}

export function writeRoomJourney(journey: RoomJourney) {
  // Preserve Next's router tree and any modal-owned history fields.
  history.replaceState({ ...history.state, [HISTORY_KEY]: journey }, "");
}

/** Next and nuqs can replace an entry again after its route has committed.
 * Carry only our descriptor across same-page replacements, including filters
 * and shelf hashes. A push or replacement into another page owns new state.
 */
export function preserveRoomJourneyOnReplace() {
  const previous = history.replaceState.bind(history);
  let enabled = true;
  const replace: History["replaceState"] = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    const path = location.pathname;
    const samePage = !url || new URL(url, location.href).pathname === path;
    const journey =
      enabled && samePage && (path === "/" || isRoomDestination(path))
        ? readRoomJourney(history.state)
        : null;
    if (
      journey &&
      (data === null || typeof data === "object") &&
      !(data && HISTORY_KEY in data)
    ) {
      previous({ ...data, [HISTORY_KEY]: journey }, unused, url);
    } else previous(data, unused, url);
  };
  history.replaceState = replace;
  return () => {
    enabled = false;
    // nuqs may have wrapped us after mounting. Leave that wrapper intact.
    if (history.replaceState === replace) history.replaceState = previous;
  };
}

export function measureRoomSource(
  journey: RoomJourney | null,
  generation: number,
  project: (id: string) => OriginRect | null,
): OriginRect | null {
  if (!journey?.source || journey.generation !== generation) return null;
  const { source } = journey;
  const rect =
    source.kind === "scene"
      ? project(source.id)
      : document
          .querySelector<HTMLElement>(
            `[${SOURCE_ATTRIBUTE}="${CSS.escape(source.id)}"]`,
          )
          ?.getBoundingClientRect();
  if (
    !rect ||
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.left >= innerWidth ||
    rect.top >= innerHeight ||
    rect.left + rect.width <= 0 ||
    rect.top + rect.height <= 0
  )
    return null;
  return rect;
}
