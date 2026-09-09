import type { BookLookup, ManualData } from "../types";
import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import React from "react";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";
import { NotionBlockRenderer } from "~/components/notion";

function HeroPanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--dl-border-strong))] bg-foreground/[0.03] p-6">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

/**
 * Everything below the title is Notion's: the lead paragraph is the page's
 * own opening, and each panel is a heading above the first section (TL;DR,
 * the 30-second intro, the mission statement) with the blocks under it. The
 * site does not know the panels by name, so a renamed or added panel flows
 * through on the next sync.
 */
export default function ManualHero({
  hero,
  lastUpdated,
  bookLookup,
}: {
  hero: ManualData["hero"];
  lastUpdated: string;
  bookLookup?: BookLookup;
}) {
  return (
    <>
      <SkyHero>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <BookOpenTextIcon
              size={28}
              weight="duotone"
              className="shrink-0 text-[hsl(var(--dl-sky-ink))]"
            />
            <h1 className="dl-hero-title">
              <span className="sm:hidden">Chappy&apos;s POM</span>
              <span className="hidden sm:inline">
                Chappy&apos;s Personal Operating Manual
              </span>
            </h1>
          </div>

          {hero.lead.length > 0 && (
            <div className="dl-prose">
              {hero.lead.map((block, i) => (
                <NotionBlockRenderer
                  key={i}
                  block={block}
                  bookLookup={bookLookup}
                />
              ))}
            </div>
          )}

          <DaylightHeroMeta lastUpdated={lastUpdated} />
        </div>
      </SkyHero>

      {hero.panels.length > 0 && (
        <div className="dl-columns mt-10 px-4">
          <div className="dl-column space-y-6">
            {hero.panels.map((panel) => (
              <HeroPanel key={panel.id} label={panel.title}>
                <div className="dl-prose">
                  {panel.blocks.map((block, i) => (
                    <NotionBlockRenderer
                      key={i}
                      block={block}
                      bookLookup={bookLookup}
                    />
                  ))}
                </div>
              </HeroPanel>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
