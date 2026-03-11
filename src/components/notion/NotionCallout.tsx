import React from "react";

import type { BookLookup, NotionBlock } from "~/components/notion/types";
import NotionBlockRenderer from "./NotionBlockRenderer";

const calloutColorMap: Record<string, { border: string; bg: string }> = {
  blue: {
    border: "border-blue-400",
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
  },
  blue_background: {
    border: "border-blue-400",
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
  },
  yellow: {
    border: "border-amber-400",
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
  },
  yellow_background: {
    border: "border-amber-400",
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
  },
  green: {
    border: "border-emerald-400",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
  },
  green_background: {
    border: "border-emerald-400",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
  },
  pink: {
    border: "border-pink-400",
    bg: "bg-pink-50/60 dark:bg-pink-950/20",
  },
  pink_background: {
    border: "border-pink-400",
    bg: "bg-pink-50/60 dark:bg-pink-950/20",
  },
  purple: {
    border: "border-purple-400",
    bg: "bg-purple-50/60 dark:bg-purple-950/20",
  },
  purple_background: {
    border: "border-purple-400",
    bg: "bg-purple-50/60 dark:bg-purple-950/20",
  },
  red: {
    border: "border-red-400",
    bg: "bg-red-50/60 dark:bg-red-950/20",
  },
  red_background: {
    border: "border-red-400",
    bg: "bg-red-50/60 dark:bg-red-950/20",
  },
  orange: {
    border: "border-orange-400",
    bg: "bg-orange-50/60 dark:bg-orange-950/20",
  },
  orange_background: {
    border: "border-orange-400",
    bg: "bg-orange-50/60 dark:bg-orange-950/20",
  },
  gray: {
    border: "border-gray-400",
    bg: "bg-gray-50/60 dark:bg-gray-800/20",
  },
  gray_background: {
    border: "border-gray-400",
    bg: "bg-gray-50/60 dark:bg-gray-800/20",
  },
  default: {
    border: "border-muted-foreground/30",
    bg: "bg-muted/40",
  },
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
  const colors = calloutColorMap[color] ?? calloutColorMap.default!;

  return (
    <div
      className={`flex gap-3 rounded-lg border-l-4 ${colors.border} ${colors.bg} p-4`}
    >
      <span className="mt-0.5 text-lg leading-none">{icon}</span>
      <div className="flex-1 space-y-2">
        {content.map((block, i) => (
          <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
      </div>
    </div>
  );
}
