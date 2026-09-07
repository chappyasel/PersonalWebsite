"use client";

import { useId, useState } from "react";

import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup, NotionBlock } from "~/components/notion/types";
import { DisclosureCaret, DisclosurePanel } from "~/components/ui/disclosure";

export default function TimelineEntry({
  time,
  title,
  blocks,
  bookLookup,
}: {
  time: string;
  title: string;
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div>
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group/timeline-entry dl-entry-head"
      >
        <span className="dl-entry-time font-mono">{time}</span>
        <span className="dl-entry-dot" />
        {/* Nudged off the title: the glyph's ink is right-heavy in its box. */}
        <DisclosureCaret
          open={open}
          className="-translate-x-0.5 justify-self-center group-hover/timeline-entry:text-foreground"
        />
        <span className="dl-entry-title">{title}</span>
      </button>
      <DisclosurePanel id={contentId} open={open}>
        <div className="dl-entry-body space-y-2 text-muted-foreground">
          {blocks.map((block, i) => (
            <NotionBlockRenderer
              key={i}
              block={block}
              bookLookup={bookLookup}
            />
          ))}
        </div>
      </DisclosurePanel>
    </div>
  );
}
