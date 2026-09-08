"use client";

import type { BookLookup, TimelineEntry as TimelineEntryType } from "../types";

import DaylightSection from "~/components/daylight/DaylightSection";

import TimelineEntry from "./TimelineEntry";

function TimelineSection({
  id,
  label,
  entries,
  bookLookup,
  arc,
}: {
  id: string;
  label: string;
  entries: TimelineEntryType[];
  bookLookup?: BookLookup;
  arc: "am" | "pm";
}) {
  // Same folding header as every other section; the arm's tint lives on
  // the icon and the axis is the entries' spine below.
  return (
    <DaylightSection id={id} title={label} data-arc={arc} className="dl-tl">
      <div className="dl-tl-body mt-2">
        {entries.map((entry, i) => (
          <TimelineEntry
            key={i}
            time={entry.time}
            title={entry.title}
            blocks={entry.blocks}
            bookLookup={bookLookup}
          />
        ))}
      </div>
    </DaylightSection>
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
    <div className="space-y-14">
      <TimelineSection
        id="morning"
        label="Morning"
        entries={am}
        bookLookup={bookLookup}
        arc="am"
      />
      <TimelineSection
        id="evening"
        label="Evening"
        entries={pm}
        bookLookup={bookLookup}
        arc="pm"
      />
    </div>
  );
}
