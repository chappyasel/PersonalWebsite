"use client";

import { BookOpenTextIcon } from "@phosphor-icons/react";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import DocCard from "./DocCard";

export type ManualSectionRow = { id: string; title: string; icon: string };

/**
 * The manual's card: its five sections as a table of contents, each behind
 * the glyph the page gives it. Read from the synced snapshot by
 * PersonalSystems, so a renamed section flows through on the next sync.
 */
export default function PersonalManual({
  updated,
  sections,
}: {
  updated: string;
  sections: ManualSectionRow[];
}) {
  return (
    <DocCard
      href="/manual"
      title="Personal Operating Manual"
      glyph={BookOpenTextIcon}
      sky="day"
      updated={updated}
      description="How I work, think, and collaborate. A guide to understanding what drives me and how to work with me best."
      cta="Read the full manual"
    >
      <ol
        data-manual-section-index=""
        className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2"
      >
        {sections.map((section, index) => (
          <li
            key={section.id}
            className="flex min-h-11 items-center gap-2.5 border-b border-foreground/10 py-2 text-sm leading-snug last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <span className="w-5 shrink-0 font-mono text-[0.68rem] tabular-nums text-muted-foreground/70">
              {String(index + 1).padStart(2, "0")}
            </span>
            <SectionIcon
              id={section.id}
              emoji={section.icon}
              size={15}
              className="shrink-0"
            />
            <span className="font-medium text-foreground/90">
              {section.title}
            </span>
          </li>
        ))}
      </ol>
    </DocCard>
  );
}
