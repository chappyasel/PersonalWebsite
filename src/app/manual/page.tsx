import rawData from "../../../public/data/manual.json";
import React from "react";

import { lookupInlineBooks } from "~/lib/books/inlineLookup";
import { loadSitePageCards } from "~/lib/site/pageCards";

import ManualHero from "./components/ManualHero";
import ManualSection from "./components/ManualSection";
import {
  DaylightTOCSidebar,
  DaylightTOCSpacer,
} from "~/components/daylight/DaylightTOC";
import SkyFooter from "~/components/daylight/SkyFooter";
import { SitePageCardsProvider } from "~/components/site/SitePageCards";

import type { ManualData } from "./types";

const data = rawData as unknown as ManualData;

export default async function ManualPage() {
  // The page is static JSON. The library only decorates its book links, and
  // the placard loaders only feed the hover cards on links to the site's
  // other pages.
  const [bookLookup, cards] = await Promise.all([
    lookupInlineBooks("manual:books", data),
    loadSitePageCards("manual"),
  ]);

  const tocItems = data.sections.map((section) => ({
    id: section.id,
    label: section.title,
    emoji: section.icon,
  }));

  return (
    <SitePageCardsProvider cards={cards}>
      <div className="daylight-root dl-ground-wash min-h-screen bg-background text-muted-foreground">
        <main className="relative">
          <ManualHero
            hero={data.hero}
            lastUpdated={data.lastUpdated}
            bookLookup={bookLookup}
          />

          {/* Content with TOC */}
          <div className="mx-auto max-w-5xl px-4 pb-12">
            <div className="mt-11 flex justify-center">
              <DaylightTOCSidebar items={tocItems} />
              <div className="w-full max-w-[45rem] space-y-12">
                {data.sections.map((section) => (
                  <ManualSection
                    key={section.id}
                    section={section}
                    bookLookup={bookLookup}
                  />
                ))}
              </div>
              <DaylightTOCSpacer />
            </div>
          </div>
          <SkyFooter />
        </main>
      </div>
    </SitePageCardsProvider>
  );
}
