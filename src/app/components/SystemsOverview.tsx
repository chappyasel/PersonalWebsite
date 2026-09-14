"use client";

import { GearIcon } from "@phosphor-icons/react";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import DocCard, { DocSectionLabel } from "./DocCard";

export type SystemsLayerRow = {
  id: string;
  number: number | null;
  title: string;
  icon: string;
};

/**
 * The seven layer titles come from the synced document snapshot.
 */
export default function SystemsOverview({
  updated,
  layers,
}: {
  updated: string;
  layers: SystemsLayerRow[];
}) {
  return (
    <DocCard
      href="/systems"
      title="Personal Systems"
      glyph={GearIcon}
      sky="night"
      updated={updated}
      description="The seven layers I use to run my life, from who I am and where I am headed down to the tools that make it automatic. The manual above and the routine below are two of its parts."
    >
      <ol
        data-systems-layer-index=""
        className="grid grid-cols-2 gap-x-4 gap-y-2"
      >
        {layers.map((layer) => (
          <li
            key={layer.id}
            className="homepage-card-section-label flex min-w-0 items-center gap-2"
          >
            <SectionIcon
              id={layer.id}
              emoji={layer.icon}
              size={15}
              className="shrink-0"
            />
            <DocSectionLabel>
              {layer.title}
            </DocSectionLabel>
          </li>
        ))}
      </ol>
    </DocCard>
  );
}
