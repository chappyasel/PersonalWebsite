"use client";

import { SunHorizonIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import DocCard from "./DocCard";

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
      cta="See the full routine"
    >
      <div
        data-routine-timeline
        className="relative mt-5 grid grid-cols-4 pb-4 pt-1"
      >
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-3 h-0.5 bg-gradient-to-r from-amber-500 via-amber-500 to-indigo-500 dark:from-amber-400 dark:via-amber-400 dark:to-indigo-400"
          style={timelineLineStyle}
        />
        {markers.map(({ time, label, isAM }) => (
          <div
            key={label}
            className="relative z-10 flex min-w-0 flex-col items-center text-center"
          >
            <span
              aria-hidden="true"
              className={`mb-2 size-4 rounded-full border-2 bg-transparent ${isAM ? "border-amber-500 dark:border-amber-400" : "border-indigo-500 dark:border-indigo-400"}`}
            />
            <span
              className={`font-mono text-[0.7rem] font-semibold tabular-nums sm:text-xs ${isAM ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"}`}
            >
              {time}
            </span>
            <span className="mt-1 text-xs font-medium text-muted-foreground">
              {label}
            </span>
          </div>
        ))}
      </div>

      <ol
        data-routine-section-index=""
        className="grid grid-cols-2 gap-x-6 sm:grid-cols-3"
      >
        {routineSections.map((section, index) => (
          <li
            key={section.id}
            className="flex min-h-11 items-center gap-2.5 border-b border-foreground/10 py-2 text-sm leading-snug [&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-last-child(-n+3)]:border-b-0"
          >
            <span className="w-5 shrink-0 font-mono text-[0.68rem] tabular-nums text-muted-foreground/70">
              {String(index + 1).padStart(2, "0")}
            </span>
            <SectionIcon id={section.id} size={15} className="shrink-0" />
            <span className="font-medium text-foreground/90">
              {section.label}
            </span>
          </li>
        ))}
      </ol>
    </DocCard>
  );
}
