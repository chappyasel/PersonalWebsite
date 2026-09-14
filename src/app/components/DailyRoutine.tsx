"use client";

import { SunHorizonIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import DocCard, { DocSectionLabel } from "./DocCard";

export type RoutineMarker = { time: string; label: string; isAM: boolean };

const timelineLineStyle = {
  // Cut the track out beneath every marker so the clear centers reveal the
  // card art instead of showing the line through them.
  maskImage:
    "linear-gradient(to right, transparent 0 8px, black 8px calc(33.333% - 8px), transparent calc(33.333% - 8px) calc(33.333% + 8px), black calc(33.333% + 8px) calc(66.667% - 8px), transparent calc(66.667% - 8px) calc(66.667% + 8px), black calc(66.667% + 8px) calc(100% - 8px), transparent calc(100% - 8px))",
  WebkitMaskImage:
    "linear-gradient(to right, transparent 0 8px, black 8px calc(33.333% - 8px), transparent calc(33.333% - 8px) calc(33.333% + 8px), black calc(33.333% + 8px) calc(66.667% - 8px), transparent calc(66.667% - 8px) calc(66.667% + 8px), black calc(66.667% + 8px) calc(100% - 8px), transparent calc(100% - 8px))",
} satisfies CSSProperties;

// The owner's short list of what the routine page covers, by the page's
// section ids so each row wears the page's own glyph.
const routineSections = [
  { id: "why-early", label: "Why So Early?" },
  { id: "morning", label: "Morning" },
  { id: "evening", label: "Evening" },
  { id: "supp-stacks", label: "Supplement Stacks" },
  { id: "caffeine", label: "Caffeine" },
  { id: "sleep-duration", label: "Sleep & Recovery" },
];

/**
 * The routine's card: the day's four beats on a timeline (times read from
 * the synced snapshot by PersonalSystems, so they cannot drift), then the
 * page's sections as a table of contents.
 */
export default function DailyRoutine({
  updated,
  markers,
}: {
  updated: string;
  markers: RoutineMarker[];
}) {
  return (
    <DocCard
      href="/routine"
      title="Core Daily Routine"
      glyph={SunHorizonIcon}
      sky="dawn"
      updated={updated}
      description="My infamously early morning routine, from a 3:45am wake-up through workout, work, and wind-down by 9:15pm."
    >
      <div
        data-routine-timeline
        className="relative mt-1 grid grid-cols-4 pb-5 pt-1"
      >
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-3 h-0.5 bg-gradient-to-r from-yellow-700 via-yellow-700 to-indigo-600 dark:from-amber-400 dark:via-amber-400 dark:to-indigo-400"
          style={timelineLineStyle}
        />
        {markers.map(({ time, label, isAM }) => (
          <div
            key={label}
            className="relative z-10 flex min-w-0 flex-col items-center text-center"
          >
            <span
              aria-hidden="true"
              className={`mb-2 size-4 rounded-full border-2 bg-transparent ${isAM ? "border-yellow-700 dark:border-amber-400" : "border-indigo-600 dark:border-indigo-400"}`}
            />
            <span
              className={`font-mono homepage-card-meta font-semibold tabular-nums ${isAM ? "text-yellow-700 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"}`}
            >
              {time}
            </span>
            <span className="mt-1 homepage-card-meta font-medium text-foreground">
              {label}
            </span>
          </div>
        ))}
      </div>

      <ol
        data-routine-section-index=""
        className="grid grid-cols-2 gap-x-4 gap-y-2"
      >
        {routineSections.map((section) => (
          <li
            key={section.id}
            className="homepage-card-section-label flex min-w-0 items-center gap-1.5"
          >
            <SectionIcon id={section.id} size={15} className="shrink-0" />
            <DocSectionLabel>
              {section.label}
            </DocSectionLabel>
          </li>
        ))}
      </ol>
    </DocCard>
  );
}
