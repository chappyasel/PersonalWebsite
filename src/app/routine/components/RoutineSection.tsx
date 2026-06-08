"use client";

import { useState } from "react";

import { CaretRightIcon } from "@phosphor-icons/react";

import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";

import type { RoutineSection as RoutineSectionType } from "../types";
import { AnchorLink, releaseHash, useHashTarget } from "./sectionLink";

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
        className="group/sec flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="text-2xl">{section.icon}</span>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {section.title}
        </h2>
        <AnchorLink id={section.id} />
        <CaretRightIcon
          data-routine-caret
          size={16}
          weight="bold"
          className={`ml-auto shrink-0 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </div>
      <div
        data-routine-collapse
        data-open={open}
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-in-out data-[open=true]:grid-rows-[1fr]"
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-4 pb-4 pt-2 text-muted-foreground">
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
