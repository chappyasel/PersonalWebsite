"use client";

import type { RoutineSection as RoutineSectionType } from "../types";
import { useState } from "react";

import AnchorLink from "~/components/daylight/AnchorLink";
import { SectionIcon } from "~/components/daylight/sectionIcons";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";
import { DisclosureCaret } from "~/components/ui/disclosure";

import { releaseHash, useHashTarget } from "./sectionLink";

export default function RoutineSection({
  section,
  bookLookup,
  defaultOpen = false,
}: {
  section: RoutineSectionType;
  bookLookup?: BookLookup;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useHashTarget(section.id, setOpen);

  const toggle = () => {
    releaseHash(); // drop the deep-link target so :target stops forcing open
    setOpen((v) => !v);
  };

  return (
    <section id={section.id} className="routine-collapsible scroll-mt-24">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="group/sec flex w-full cursor-pointer items-center gap-2.5 border-b border-border/80 pb-2 text-left"
      >
        <SectionIcon
          id={section.id}
          emoji={section.icon}
          size={18}
          className="shrink-0"
        />
        <h2 className="dl-h2">{section.title}</h2>
        <AnchorLink id={section.id} />
        <DisclosureCaret
          data-routine-caret
          open={open}
          className="ml-auto group-hover/sec:text-foreground"
        />
      </div>
      <div
        data-routine-collapse
        data-open={open}
        className="duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] grid grid-rows-[0fr] transition-[grid-template-rows] data-[open=true]:grid-rows-[1fr]"
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pb-4 pt-3.5 text-[0.9375rem] text-muted-foreground">
            {section.blocks.map((block, i) => (
              <NotionBlockRenderer
                key={i}
                block={block}
                bookLookup={bookLookup}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
