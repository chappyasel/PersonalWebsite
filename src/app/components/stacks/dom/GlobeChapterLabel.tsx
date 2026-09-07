"use client";

// The chapter, visited-country, or lived-place mark under the pointer while
// the About globe is up close. Same glass as the Portal Label, with its own
// attribute: the interface fades under `data-prop-focus` while a prop is near,
// and this label is the one piece of chrome that belongs to that state.
import {
  globeChapterLabel,
  globeLivedPlaceStatus,
  globeVisitedPlaceStatus,
  useGlobeChapterHover,
} from "../scene/globeChapterHover";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import React from "react";

export default function GlobeChapterLabel() {
  const hover = useGlobeChapterHover();
  if (!hover) return null;
  const chapter = hover.kind === "chapter";
  const single = chapter && hover.chapters.length === 1;
  return (
    <div
      data-stacks-globe-label
      style={{ left: hover.x, top: hover.y - 12 }}
      className="field-notes-glass-tooltip pointer-events-none fixed z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg border px-2.5 py-1.5 backdrop-blur-xl backdrop-saturate-150"
    >
      <span className="flex min-w-0 flex-col text-left text-[13px] leading-[1.25]">
        <span className="flex min-w-0 items-start gap-1">
          <span className="min-w-0 whitespace-normal break-words">
            {chapter ? globeChapterLabel(hover.chapters) : hover.place.name}
          </span>
          {chapter && (
            <ArrowSquareOutIcon
              size={13}
              weight="bold"
              className="mt-px shrink-0"
              aria-hidden
            />
          )}
        </span>
        <span className="mt-0.5 min-w-0 whitespace-normal break-words text-[12px] leading-[1.3] text-white/60">
          {hover.kind === "lived"
            ? globeLivedPlaceStatus(hover.place)
            : hover.kind === "visited"
              ? globeVisitedPlaceStatus()
              : single
                ? "AI Collective chapter"
                : "AI Collective chapters"}
        </span>
      </span>
    </div>
  );
}
