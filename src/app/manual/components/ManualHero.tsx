import type { BookLookup, ManualData } from "../types";
import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import React from "react";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";
import { NotionBlockRenderer } from "~/components/notion";

/**
 * The sky band: the title, then the page's own opening paragraph from
 * Notion, then the wayfinding line. The headings above the first Notion
 * section (TL;DR, the 30-second intro, the life purpose) are not part of
 * it; ManualOverview renders them as the body's first section so the rail
 * begins where the sky ends.
 */
export default function ManualHero({
  lead,
  lastUpdated,
  bookLookup,
}: {
  lead: ManualData["hero"]["lead"];
  lastUpdated: string;
  bookLookup?: BookLookup;
}) {
  return (
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

        {lead.length > 0 && (
          <div className="dl-prose">
            {lead.map((block, i) => (
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
  );
}
