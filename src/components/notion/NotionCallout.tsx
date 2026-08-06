import React from "react";

import type { BookLookup, NotionBlock } from "~/components/notion/types";
import NotionBlockRenderer from "./NotionBlockRenderer";

/**
 * A hairline box on the site's own neutral surface. Deliberately not a tinted
 * panel with a thick accent rail: a left-only border under `rounded-lg` curls
 * around the corner radius, and the pastel-fill-plus-colored-bar treatment
 * reads as generic rather than like the rest of the site.
 *
 * Notion's per-block color survives only as a low-opacity border tint, which
 * is enough to separate a warning from an aside without turning the page into
 * a set of highlighter blocks.
 */
const calloutColorMap: Record<string, string> = {
  blue: "border-blue-500/30",
  blue_background: "border-blue-500/30",
  yellow: "border-amber-500/35",
  yellow_background: "border-amber-500/35",
  green: "border-emerald-500/30",
  green_background: "border-emerald-500/30",
  pink: "border-pink-500/30",
  pink_background: "border-pink-500/30",
  purple: "border-purple-500/30",
  purple_background: "border-purple-500/30",
  red: "border-red-500/35",
  red_background: "border-red-500/35",
  orange: "border-orange-500/35",
  orange_background: "border-orange-500/35",
  gray: "border-border",
  gray_background: "border-border",
  default: "border-border",
};

export default function NotionCallout({
  icon,
  color,
  content,
  bookLookup,
}: {
  icon: string;
  color: string;
  content: NotionBlock[];
  bookLookup?: BookLookup;
}) {
  const borderColor = calloutColorMap[color] ?? calloutColorMap.default!;

  return (
    <div
      className={`flex gap-3 rounded-lg border ${borderColor} bg-muted/40 px-4 py-3.5`}
    >
      <span className="mt-0.5 shrink-0 text-base leading-none">{icon}</span>
      <div className="min-w-0 flex-1 space-y-2">
        {content.map((block, i) => (
          <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
      </div>
    </div>
  );
}
