"use client";

import {
  MoonStarsIcon,
  SunIcon,
} from "@phosphor-icons/react";

import type { BookLookup, TimelineEntry as TimelineEntryType } from "../types";
import { AnchorLink, useHashTarget } from "./sectionLink";
import TimelineEntry from "./TimelineEntry";

function TimelineSection({
  label,
  icon,
  entries,
  bookLookup,
  accentColor,
  lineColor,
}: {
  label: string;
  icon: React.ReactNode;
  entries: TimelineEntryType[];
  bookLookup?: BookLookup;
  accentColor: "amber" | "indigo";
  lineColor: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  useHashTarget(id);

  return (
    <div id={id} className="scroll-mt-24">
      {/* Section header */}
      <div className="group/sec mb-6 flex items-center gap-3 px-4">
        {icon}
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {label}
        </h2>
        <AnchorLink id={id} />
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div
          className={`absolute left-[calc(5rem+0.375rem)] top-0 h-full w-0.5 ${lineColor}`}
        />

        {entries.map((entry, i) => (
          <TimelineEntry
            key={i}
            time={entry.time}
            title={entry.title}
            blocks={entry.blocks}
            bookLookup={bookLookup}
            accentColor={accentColor}
          />
        ))}
      </div>
    </div>
  );
}

export default function RoutineTimeline({
  am,
  pm,
  bookLookup,
}: {
  am: TimelineEntryType[];
  pm: TimelineEntryType[];
  bookLookup?: BookLookup;
}) {
  return (
    <div className="space-y-12">
      <TimelineSection
        label="Morning"
        icon={
          <SunIcon
            size={24}
            weight="duotone"
            className="text-amber-500"
          />
        }
        entries={am}
        bookLookup={bookLookup}
        accentColor="amber"
        lineColor="bg-gradient-to-b from-amber-300 to-amber-200 dark:from-amber-600 dark:to-amber-800"
      />

      <TimelineSection
        label="Evening"
        icon={
          <MoonStarsIcon
            size={24}
            weight="duotone"
            className="text-indigo-400"
          />
        }
        entries={pm}
        bookLookup={bookLookup}
        accentColor="indigo"
        lineColor="bg-gradient-to-b from-indigo-300 to-indigo-200 dark:from-indigo-600 dark:to-indigo-800"
      />
    </div>
  );
}
