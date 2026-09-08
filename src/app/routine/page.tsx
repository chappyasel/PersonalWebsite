import rawData from "../../../public/data/routine.json";

import { lookupInlineBooks } from "~/lib/books/inlineLookup";
import { loadSitePageCards } from "~/lib/site/pageCards";

import RoutineHero from "./components/RoutineHero";
import RoutineSection from "./components/RoutineSection";
import RoutineTimeline from "./components/RoutineTimeline";
import SupplementCardsSection from "./components/SupplementCards";
import { DaylightTOCSidebar } from "~/components/daylight/DaylightTOC";
import SkyFooter from "~/components/daylight/SkyFooter";
import { HashScrollSpacer } from "~/components/daylight/hashTarget";
import { SitePageCardsProvider } from "~/components/site/SitePageCards";

import type { RoutineData } from "./types";

const data = rawData as unknown as RoutineData;

export default async function RoutinePage() {
  // The page is static JSON. The library only decorates its book links, and
  // the placard loaders only feed the hover cards on links to the site's
  // other pages.
  const [bookLookup, cards] = await Promise.all([
    lookupInlineBooks("routine:books", data),
    loadSitePageCards("routine"),
  ]);

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
    <SitePageCardsProvider cards={cards}>
      <div className="daylight-root dl-ground-arc min-h-screen bg-background text-foreground">
        <main className="relative">
          <RoutineHero
            intro={data.intro}
            lastUpdated={data.lastUpdated}
            bookLookup={bookLookup}
          />

          {/* Content with TOC */}
          <div className="dl-columns mt-11 px-4 pb-12">
            <DaylightTOCSidebar items={tocItems} />
            <div className="dl-column space-y-14" data-routine-content>
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

              {/* Related Rants (excluding supp-stacks): long essays, so they
                  start folded (owner's call); a deep link or a rail click
                  opens one. */}
              {otherRants.map((section) => (
                <RoutineSection
                  key={section.id}
                  section={section}
                  bookLookup={bookLookup}
                  defaultOpen={false}
                />
              ))}

              <HashScrollSpacer />
            </div>
          </div>
          <SkyFooter />
        </main>
      </div>
    </SitePageCardsProvider>
  );
}
