import React from "react";

import {
  DaylightTOCSidebar,
  type TOCItem,
} from "~/components/daylight/DaylightTOC";
import { DaylightTOCSpacer } from "~/components/daylight/DaylightTOC";
import { HashScrollSpacer } from "~/components/daylight/hashTarget";
import SkyFooter from "~/components/daylight/SkyFooter";
import { SitePageCardsProvider } from "~/components/site/SitePageCards";
import { lookupInlineBooks } from "~/lib/books/inlineLookup";
import { loadSitePageCards } from "~/lib/site/pageCards";

import SystemsHero from "./components/SystemsHero";
import SystemsSection from "./components/SystemsSection";
import type { SystemsData } from "./types";

import rawData from "../../../public/data/systems.json";

const data = rawData as unknown as SystemsData;

export default async function SystemsPage() {
  // The page is static JSON. The library only decorates its book links (the
  // twenty in Further Reading and the one in the intro), and the placard
  // loaders only feed the hover cards on links to the site's other pages.
  const [bookLookup, cards] = await Promise.all([
    lookupInlineBooks("systems:books", data),
    loadSitePageCards("systems"),
  ]);

  // The sidebar lists every section, with the seven layers nested under
  // theirs so a reader can land on one layer without opening the fold.
  const tocItems: TOCItem[] = data.sections.flatMap((section) => [
    { id: section.id, label: section.title, emoji: section.icon },
    ...(section.layers ?? []).map((layer) => ({
      id: layer.id,
      label: layer.title,
      emoji: layer.icon,
      depth: 1 as const,
    })),
  ]);

  return (
    <SitePageCardsProvider cards={cards}>
      <div className="daylight-root dl-ground-wash min-h-screen bg-background text-muted-foreground">
        <main className="relative">
          <SystemsHero
            intro={data.intro}
            lastUpdated={data.lastUpdated}
            bookLookup={bookLookup}
          />

          {/* Content with TOC */}
          <div className="mx-auto max-w-5xl px-4 pb-12">
            <div className="mt-11 flex justify-center">
              <DaylightTOCSidebar items={tocItems} />
              <div
                className="w-full max-w-[45rem] space-y-12"
                data-systems-content
              >
                {data.sections.map((section) => (
                  <SystemsSection
                    key={section.id}
                    section={section}
                    bookLookup={bookLookup}
                  />
                ))}
                <HashScrollSpacer />
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
