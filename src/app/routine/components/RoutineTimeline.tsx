"use client";

import type { BookLookup, TimelineEntry as TimelineEntryType } from "../types";

import AnchorLink from "~/components/daylight/AnchorLink";
import { SectionIcon } from "~/components/daylight/sectionIcons";

import TimelineEntry from "./TimelineEntry";
import { useHashTarget } from "./sectionLink";

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
  useHashTarget(id);

  return (
    <section id={id} data-arc={arc} className="dl-tl scroll-mt-24">
      {/* Same flush header as every other section; the arm's tint lives on
          the icon and the axis is the entries' spine below. */}
      <div className="group/sec flex items-center gap-2.5 border-b border-border/80 pb-2">
        <SectionIcon id={id} size={18} className="shrink-0" />
        <h2 className="dl-h2">{label}</h2>
        <AnchorLink id={id} />
      </div>

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
    </section>
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
