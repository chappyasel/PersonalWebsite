import { inArray } from "drizzle-orm";
import React from "react";

import { GrainientBackground } from "~/components/ui/grainient-background";
import { db } from "~/server/db";
import { books } from "~/server/db/schema";

import ManualHero from "./components/ManualHero";
import ManualSection from "./components/ManualSection";
import { ManualTOCMobile, ManualTOCSidebar } from "./components/ManualTOC";
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

export default async function ManualPage() {
  // Fetch book metadata for all referenced books
  const slugs = extractBookSlugs(data);
  const bookRows =
    slugs.length > 0
      ? await db
          .select({ id: books.id, title: books.title, coverUrl: books.coverUrl })
          .from(books)
          .where(inArray(books.id, slugs))
      : [];

  const bookLookup: BookLookup = {};
  for (const b of bookRows) {
    bookLookup[b.id] = { title: b.title, coverUrl: b.coverUrl };
  }

  return (
    <GrainientBackground className="min-h-screen bg-background font-serif text-muted-foreground">
      <main className="relative">
        <div className="mx-auto max-w-5xl px-4 py-12">
          {/* Hero */}
          <div className="mx-auto max-w-2xl">
            <ManualHero hero={data.hero} lastUpdated={data.lastUpdated} />
          </div>

          {/* Content with TOC */}
          <div className="mt-16 flex justify-center">
            <ManualTOCSidebar sections={data.sections} />
            <div className="w-full max-w-2xl space-y-4">
              {/* Mobile sticky TOC */}
              <ManualTOCMobile sections={data.sections} />

              {data.sections.map((section) => (
                <ManualSection
                  key={section.id}
                  section={section}
                  bookLookup={bookLookup}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </GrainientBackground>
  );
}
