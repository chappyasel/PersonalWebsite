"use client";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import type { BookLookup, TimelineEntry as TimelineEntryType } from "../types";
import { AnchorLink, useHashTarget } from "./sectionLink";
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
  useHashTarget(id);

  return (
    <section id={id} data-arc={arc} className="dl-tl scroll-mt-24">
      {/* Section header, indented to the title column with its icon node
          hanging back on the axis */}
      <div className="dl-tl-h group/sec flex items-center gap-2.5">
        <span className="dl-tl-node">
          <SectionIcon id={id} size={22} />
        </span>
        <h2 className="dl-h2">{label}</h2>
        <AnchorLink id={id} />
      </div>

      <div className="mt-4">
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
