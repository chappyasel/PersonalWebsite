// Which chapter, visited-country, or lived-place mark the pointer is over on
// the near globe, for the DOM label.
//
// Three-free on purpose: the chrome layer imports this on the homepage's
// first load, and one value import of three there adds the whole core
// before first paint (initialGraph.test.ts walks the graph). The scene side
// writes it every frame from GlobeCloseUp; the label subscribes.
import { useSyncExternalStore } from "react";

import type { LivedPlace, VisitedPlace } from "./aboutTravel";
import type { AicChapter } from "./aicChapters";

type GlobeHoverPosition = Readonly<{
  index: number;
  /** Viewport pixels of the mark. */
  x: number;
  y: number;
}>;

export type GlobeChapterHover =
  | (GlobeHoverPosition &
      Readonly<{ kind: "chapter"; chapters: readonly AicChapter[] }>)
  | (GlobeHoverPosition & Readonly<{ kind: "visited"; place: VisitedPlace }>)
  | (GlobeHoverPosition & Readonly<{ kind: "lived"; place: LivedPlace }>);

let hover: GlobeChapterHover | null = null;
const listeners = new Set<() => void>();

export const globeChapterHover = {
  get current() {
    return hover;
  },
  set(next: GlobeChapterHover | null) {
    if (next === hover) return;
    if (
      next &&
      next.kind === hover?.kind &&
      next.index === hover?.index &&
      Math.abs(next.x - hover.x) < 0.5 &&
      Math.abs(next.y - hover.y) < 0.5
    )
      return;
    hover = next;
    for (const listener of listeners) listener();
  },
  // An arrow, not a method: useSyncExternalStore takes it unbound.
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useGlobeChapterHover(): GlobeChapterHover | null {
  return useSyncExternalStore(
    globeChapterHover.subscribe,
    () => hover,
    () => null,
  );
}

/** Label copy for a mark: up to three names, then a count. */
export function globeChapterLabel(chapters: readonly AicChapter[]): string {
  const names = chapters.map((chapter) => chapter.name);
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

export function globeLivedPlaceStatus(place: LivedPlace): string {
  return place.current ? "I live here now" : "I lived here";
}

export function globeVisitedPlaceStatus(): string {
  return "I've visited here";
}
