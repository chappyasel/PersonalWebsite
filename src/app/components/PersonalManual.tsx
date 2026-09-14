"use client";

import { BookOpenTextIcon } from "@phosphor-icons/react";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import DocCard, { DocSectionLabel } from "./DocCard";

export type ManualSectionRow = { id: string; title: string; icon: string };

/**
 * The manual's card: its five sections as a table of contents, each behind
 * the glyph the page gives it. Read from the synced snapshot by
 * PersonalSystems, with a shorter personality label for the card.
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
    >
      <ol
        data-manual-section-index=""
        className="grid grid-cols-2 gap-x-4 gap-y-2"
      >
        {sections.map((section) => (
          <li
            key={section.id}
            className="homepage-card-section-label flex min-w-0 items-center gap-2"
          >
            <SectionIcon
              id={section.id}
              emoji={section.icon}
              size={15}
              className="shrink-0"
            />
            <DocSectionLabel>
              {section.id === "personality-strengths-blind-spots"
                ? "Personality & Strengths"
                : section.title}
            </DocSectionLabel>
          </li>
        ))}
      </ol>
    </DocCard>
  );
}
