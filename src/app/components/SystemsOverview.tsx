"use client";

import { GearIcon } from "@phosphor-icons/react";

import { SectionIcon } from "~/components/daylight/sectionIcons";

import DocCard from "./DocCard";

export type SystemsLayerRow = {
  id: string;
  number: number | null;
  title: string;
  icon: string;
  /** The layer's own line from the doc's At a Glance list. */
  blurb: string;
};

/**
 * The systems doc's card: the seven layers as a stack, each with its glyph
 * and the one line the doc's At a Glance gives it. Read from the synced
 * snapshot by PersonalSystems, so the card is the doc's own summary.
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
      cta="Read the full systems doc"
    >
      <ol data-systems-layer-index="" className="mt-4">
        {layers.map((layer, index) => (
          <li
            key={layer.id}
            className="grid grid-cols-[1.25rem_auto_1fr] items-baseline gap-x-2.5 border-b border-foreground/10 py-2.5 text-sm leading-snug last:border-b-0"
          >
            <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground/70">
              {String(layer.number ?? index + 1).padStart(2, "0")}
            </span>
            <SectionIcon
              id={layer.id}
              emoji={layer.icon}
              size={15}
              className="shrink-0 translate-y-0.5"
            />
            <span>
              <span className="font-medium text-foreground/90">
                {layer.title}
              </span>
              {layer.blurb && (
                <span className="block text-[0.8125rem] leading-snug text-muted-foreground">
                  {layer.blurb}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </DocCard>
  );
}
