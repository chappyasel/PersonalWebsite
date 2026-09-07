import { GearIcon } from "@phosphor-icons/react/dist/ssr";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";
import { NotionBlockRenderer } from "~/components/notion";

import type { BookLookup, NotionBlock } from "~/components/notion/types";

/**
 * Everything below the title is Notion's: the two opening paragraphs (the
 * first links the book that started it, the second links the tips and
 * reading sections below) and the Hamming quote.
 */
export default function SystemsHero({
  intro,
  lastUpdated,
  bookLookup,
}: {
  intro: NotionBlock[];
  lastUpdated: string;
  bookLookup?: BookLookup;
}) {
  return (
    <SkyHero>
      <div className="space-y-3 pt-10">
        {/* The theme toggle sits on the wayfinding line under the description
            (DaylightHeroMeta); the top padding keeps the title where the
            toggle's row used to hold it. */}
        <div className="flex items-center gap-3">
          <GearIcon
            size={28}
            weight="duotone"
            className="shrink-0 text-[hsl(var(--dl-sky-ink))]"
          />
          <h1 className="dl-hero-title">
            <span className="sm:hidden">Personal Systems</span>
            <span className="hidden sm:inline">
              Chappy&apos;s Personal Systems
            </span>
          </h1>
        </div>

        {intro.length > 0 && (
          <div className="max-w-[34rem] space-y-2 text-[0.9375rem]">
            {intro.map((block, i) => (
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
