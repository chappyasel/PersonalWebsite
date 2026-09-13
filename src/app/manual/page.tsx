import rawData from "../../../public/data/manual.json";
import type { ResolvingMetadata } from "next";
import React from "react";

import { lookupInlineBooks } from "~/lib/books/inlineLookup";
import { loadSitePageCards } from "~/lib/site/pageCards";
import {
  type SectionSearchParams,
  sectionMetadata,
} from "~/lib/site/sectionMetadata";

import ManualHero from "./components/ManualHero";
import ManualOverview from "./components/ManualOverview";
import ManualSection from "./components/ManualSection";
import { DaylightTOCSidebar } from "~/components/daylight/DaylightTOC";
import SkyFooter from "~/components/daylight/SkyFooter";
import { sectionShortTitle } from "~/components/daylight/sectionTitles";
import { DocumentGallery } from "~/components/images/DocumentGallery";
import { SitePageCardsProvider } from "~/components/site/SitePageCards";

import type { ManualData } from "./types";

const data = rawData as unknown as ManualData;

export function generateMetadata(
  { searchParams }: { searchParams: SectionSearchParams },
  parent: ResolvingMetadata,
) {
  return sectionMetadata("manual", searchParams, parent);
}

export default async function ManualPage() {
  // The page is static JSON. The library only decorates its book links, and
  // the placard loaders only feed the hover cards on links to the site's
  // other pages.
  const [bookLookup, cards] = await Promise.all([
    lookupInlineBooks("manual:books", data),
    loadSitePageCards("manual"),
  ]);

  // The first hero panel (TL;DR) opens the body as its own section, so the
  // rail lists it ahead of the Notion sections. The rail is 13rem; a title
  // that wraps on a phone also truncates there, so the rail takes the same
  // short form the phone heading uses.
  const [opener] = data.hero.panels;
  const tocItems = [
    ...(opener ? [{ id: opener.id, label: opener.title }] : []),
    ...data.sections.map((section) => ({
      id: section.id,
      label: sectionShortTitle(section.id) ?? section.title,
      emoji: section.icon,
    })),
  ];

  return (
    <SitePageCardsProvider cards={cards}>
      <DocumentGallery>
        <div className="daylight-root dl-ground-wash min-h-screen bg-background text-foreground">
          <main className="relative">
            <ManualHero
              lead={data.hero.lead}
              lastUpdated={data.lastUpdated}
              bookLookup={bookLookup}
            />

            {/* Content with TOC */}
            <div className="dl-columns mt-11 px-4 pb-12">
              <DaylightTOCSidebar items={tocItems} />
              <div className="dl-column space-y-14">
                <ManualOverview
                  panels={data.hero.panels}
                  bookLookup={bookLookup}
                />
                {data.sections.map((section) => (
                  <ManualSection
                    key={section.id}
                    section={section}
                    bookLookup={bookLookup}
                  />
                ))}
              </div>
            </div>
            <SkyFooter />
          </main>
        </div>
      </DocumentGallery>
    </SitePageCardsProvider>
  );
}
