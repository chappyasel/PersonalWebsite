import { inArray } from "drizzle-orm";

import { GrainientBackground } from "~/components/ui/grainient-background";
import { db } from "~/server/db";
import { books } from "~/server/db/schema";

import RoutineHero from "./components/RoutineHero";
import RoutineSection from "./components/RoutineSection";
import RoutineTimeline from "./components/RoutineTimeline";
import { RoutineTOCMobile, RoutineTOCSidebar } from "./components/RoutineTOC";
import SupplementCardsSection from "./components/SupplementCards";
import type { BookLookup, RoutineData } from "./types";

import rawData from "../../../public/data/routine.json";

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

export default async function RoutinePage() {
  // Fetch book metadata for all referenced books
  const slugs = extractBookSlugs(data);
  const bookRows =
    slugs.length > 0
      ? await db
          .select({
            id: books.id,
            title: books.title,
            coverUrl: books.coverUrl,
          })
          .from(books)
          .where(inArray(books.id, slugs))
      : [];

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
    { id: "why-early", label: "Why So Early?", icon: "⏰" },
    { id: "morning", label: "Morning", icon: "🌅" },
    { id: "evening", label: "Evening", icon: "🌆" },
    { id: "supp-stacks", label: "Supp Stacks", icon: "💊" },
    ...otherRants.map((r) => ({
      id: r.id,
      label: rantLabels[r.id] ?? r.title,
      icon: r.icon,
    })),
  ];

  return (
    <GrainientBackground className="min-h-screen bg-background font-serif text-muted-foreground">
      <main className="relative">
        <div className="mx-auto max-w-5xl px-4 py-12">
          {/* Hero */}
          <div className="mx-auto max-w-2xl">
            <RoutineHero
              intro={data.intro}
              lastUpdated={data.lastUpdated}
            />
          </div>

          {/* Content with TOC */}
          <div className="mt-16 flex justify-center">
            <RoutineTOCSidebar items={tocItems} />
            <div className="w-full max-w-2xl space-y-8">
              {/* Mobile sticky TOC */}
              <RoutineTOCMobile items={tocItems} />

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
            </div>
          </div>
        </div>
      </main>
    </GrainientBackground>
  );
}
