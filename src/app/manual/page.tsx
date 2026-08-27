import { inArray } from "drizzle-orm";
import React from "react";

import {
  DaylightTOCMobile,
  DaylightTOCSidebar,
  DaylightTOCSpacer,
} from "~/components/daylight/DaylightTOC";
import { db } from "~/server/db";
import { orEmpty } from "~/server/queries/degrade";
import { books } from "~/server/db/schema";

import ManualHero from "./components/ManualHero";
import ManualSection from "./components/ManualSection";
import type { BookLookup, ManualData } from "./types";

import rawData from "../../../public/data/manual.json";

const data = rawData as unknown as ManualData;

// Extract all book slugs from the JSON
function extractBookSlugs(obj: unknown): string[] {
  const slugs = new Set<string>();
  const json = JSON.stringify(obj);
  const re = /books\.chappyasel\.com\/([a-z0-9-]+)/g;
  let m;
  while ((m = re.exec(json)) !== null) {
    if (m[1]) slugs.add(m[1]);
  }
  return [...slugs];
}

/**
 * The page itself is static JSON. The database only supplies titles and cover
 * thumbnails for inline book links, so an outage should drop the thumbnails
 * and leave every word on the page readable.
 */
async function lookupBookRows(slugs: string[]) {
  if (slugs.length === 0) return [];
  return orEmpty(
    "manual:books",
    () =>
      db
        .select({ id: books.id, title: books.title, coverUrl: books.coverUrl })
        .from(books)
        .where(inArray(books.id, slugs)),
    [],
  );
}

export default async function ManualPage() {
  // Fetch book metadata for all referenced books
  const slugs = extractBookSlugs(data);
  const bookRows = await lookupBookRows(slugs);

  const bookLookup: BookLookup = {};
  for (const b of bookRows) {
    bookLookup[b.id] = { title: b.title, coverUrl: b.coverUrl };
  }

  const tocItems = data.sections.map((section) => ({
    id: section.id,
    label: section.title,
    emoji: section.icon,
  }));

  return (
    <div className="daylight-root dl-ground-wash min-h-screen bg-background text-muted-foreground">
      <main className="relative">
        <ManualHero hero={data.hero} lastUpdated={data.lastUpdated} />

        {/* Content with TOC */}
        <div className="mx-auto max-w-5xl px-4 pb-12">
          <div className="mt-11 flex justify-center">
            <DaylightTOCSidebar items={tocItems} />
            <div className="w-full max-w-[45rem] space-y-12">
              {/* Mobile sticky TOC */}
              <DaylightTOCMobile items={tocItems} />

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
      </main>
    </div>
  );
}
