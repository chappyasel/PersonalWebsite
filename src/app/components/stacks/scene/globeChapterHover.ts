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
let touchSelection: string | null = null;

function markerKey(mark: GlobeChapterHover | null) {
  return mark ? `${mark.kind}:${mark.index}` : null;
}
const listeners = new Set<() => void>();

export const globeChapterHover = {
  get current() {
    return hover;
  },
  set(next: GlobeChapterHover | null) {
    if (!next || markerKey(next) !== markerKey(hover)) touchSelection = null;
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
  /** Hover alone never authorizes touch navigation. Only a completed tap does. */
  selectForTouch() {
    const key = markerKey(hover);
    if (!key) return false;
    if (touchSelection === key) return true;
    touchSelection = key;
    return false;
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

const CHAPTER_TIER_RANK: Readonly<Record<string, number>> = {
  Diamond: 4,
  Platinum: 3,
  Gold: 2,
  Silver: 1,
};

/** Public tiers stand in for size because the chapter feed has no member counts.
 * Equal or missing tiers keep the feed's alphabetical order. */
export function globeChapterLabel(chapters: readonly AicChapter[]): string {
  let lead: AicChapter | undefined;
  let rank = -1;
  for (const chapter of chapters) {
    const nextRank = CHAPTER_TIER_RANK[chapter.tier ?? ""] ?? 0;
    if (nextRank > rank) {
      lead = chapter;
      rank = nextRank;
    }
  }
  if (!lead) return "";
  return lead.emoji ? `${lead.emoji} ${lead.name}` : lead.name;
}

export function globeLivedPlaceStatus(place: LivedPlace): string {
  return place.current ? "I live here now" : "I lived here";
}

export function globeVisitedPlaceStatus(): string {
  return "I've visited here";
}
