import rawData from "../../../public/data/routine.json";
import { inArray } from "drizzle-orm";

import { db } from "~/server/db";
import { orEmpty } from "~/server/queries/degrade";
import { books } from "~/server/db/schema";

import {
  DaylightTOCSidebar,
  DaylightTOCSpacer,
} from "~/components/daylight/DaylightTOC";
import SkyFooter from "~/components/daylight/SkyFooter";
import RoutineHero from "./components/RoutineHero";
import RoutineSection from "./components/RoutineSection";
import RoutineTimeline from "./components/RoutineTimeline";
import SupplementCardsSection from "./components/SupplementCards";
import { HashScrollSpacer } from "./components/sectionLink";

import type { RoutineData } from "./types";
import type { BookLookup } from "./types";

const data = rawData as unknown as RoutineData;

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
    "routine:books",
    () =>
      db
        .select({ id: books.id, title: books.title, coverUrl: books.coverUrl })
        .from(books)
        .where(inArray(books.id, slugs)),
    [],
  );
}

export default async function RoutinePage() {
  // Fetch book metadata for all referenced books
  const slugs = extractBookSlugs(data);
  const bookRows = await lookupBookRows(slugs);

  const bookLookup: BookLookup = {};
  for (const b of bookRows) {
    bookLookup[b.id] = { title: b.title, coverUrl: b.coverUrl };
  }

  // Separate supp-stacks rant (merged into supplement section) from other rants
  const suppStacksRant = data.rants.find((r) => r.id === "supp-stacks");
  const otherRants = data.rants.filter((r) => r.id !== "supp-stacks");

  // Short labels for TOC
  const rantLabels: Record<string, string> = {
    "sinusoidal-vs-square-wave-alertness": "Alertness",
    caffeine: "Caffeine",
    "sleep-duration": "Sleep",
    "getting-back-on-track": "Recovery",
  };

  // Build TOC items
  const tocItems = [
    { id: "why-early", label: "Why So Early?" },
    { id: "morning", label: "Morning" },
    { id: "evening", label: "Evening" },
    { id: "supp-stacks", label: "Supp Stacks" },
    ...otherRants.map((r) => ({
      id: r.id,
      label: rantLabels[r.id] ?? r.title,
      emoji: r.icon,
    })),
  ];

  return (
    <div className="daylight-root dl-ground-arc min-h-screen bg-background text-muted-foreground">
      <main className="relative">
        <RoutineHero intro={data.intro} lastUpdated={data.lastUpdated} />

        {/* Content with TOC */}
        <div className="mx-auto max-w-5xl px-4 pb-12">
          <div className="mt-11 flex justify-center">
            <DaylightTOCSidebar items={tocItems} />
            <div className="w-full max-w-[45rem] space-y-12" data-routine-content>
              {/* Why So Early - collapsible preface */}
              {data.whyEarly.length > 0 && (
                <RoutineSection
                  section={{
                    id: "why-early",
                    title: "Why So Early?",
                    icon: "⏰",
                    blocks: data.whyEarly,
                  }}
                  bookLookup={bookLookup}
                />
              )}

              {/* The Timeline */}
              <RoutineTimeline
                am={data.timeline.am}
                pm={data.timeline.pm}
                bookLookup={bookLookup}
              />

              {/* Supp Stacks (merged rant + cards) */}
              {(data.supplements.am.length > 0 ||
                data.supplements.pm.length > 0) && (
                <SupplementCardsSection
                  am={data.supplements.am}
                  pm={data.supplements.pm}
                  contextBlocks={suppStacksRant?.blocks}
                  bookLookup={bookLookup}
                />
              )}

              {/* Related Rants (excluding supp-stacks) */}
              {otherRants.map((section) => (
                <RoutineSection
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
        {/* The page traces the day; it ends where the day does — at night,
            in both themes. */}
        <SkyFooter night />
      </main>
    </div>
  );
}
