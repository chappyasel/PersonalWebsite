import { describe, expect, it } from "vitest";

import { SITE_PAGES, sitePageForHref } from "~/lib/site/pages";

import { rankSearchCandidates } from "./ranking";
import { COMMAND_ENTRIES } from "./registry";
import type { CommandEntry } from "./types";
import { resolveDestinationTarget } from "./urls";

const entries: readonly CommandEntry[] = COMMAND_ENTRIES;

function rankedIds(query: string) {
  return rankSearchCandidates(
    query,
    entries.map((entry) => ({ ...entry, metadata: entry.keywords })),
  ).map((entry) => entry.id);
}

describe("Universal Search command registry", () => {
  it("uses unique stable IDs", () => {
    const ids = COMMAND_ENTRIES.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("promotes the agreed primary destinations", () => {
    const promotedLabels = COMMAND_ENTRIES.filter(
      (entry) => entry.kind === "destination" && entry.promoted,
    ).map((entry) => entry.label);

    expect(promotedLabels).toEqual([
      "Home",
      "Book Notes",
      "Personal Operating Manual",
      "Core Daily Routine",
      "Personal Systems",
      "Weightlifting",
      "About",
      "Projects",
      "Musings",
    ]);
  });

  it("marks the site's own pages and names them as their heroes do", () => {
    const pages = entries.flatMap((entry) =>
      entry.kind === "destination" && entry.page
        ? [{ id: entry.id, label: entry.label, page: entry.page }]
        : [],
    );

    expect(pages.map(({ id, page }) => `${id}:${page}`)).toEqual([
      "destination-books:books",
      "destination-manual:manual",
      "destination-routine:routine",
      "destination-systems:systems",
      "destination-weightlifting:weightlifting",
    ]);
    for (const { label, page } of pages) {
      // The name the page's hero uses, so a query for it is an exact match
      // on the page rather than an alias hit.
      expect(label).toBe(SITE_PAGES[page].label);
    }
  });

  it("ranks a page above the homepage section that mentions it", () => {
    expect(rankedIds("personal systems").slice(0, 2)).toEqual([
      "destination-systems",
      "section-systems",
    ]);
    expect(rankedIds("systems")[0]).toBe("destination-systems");
    expect(rankedIds("manual")[0]).toBe("destination-manual");
    expect(rankedIds("routine")[0]).toBe("destination-routine");
  });

  it("points every page row at the page its destination opens", () => {
    const location = {
      hostname: "www.chappyasel.com",
      port: "",
      protocol: "https:",
    };
    for (const entry of entries) {
      if (entry.kind !== "destination" || !entry.page) continue;
      // The page key and the destination's target are written separately;
      // this keeps a row from describing a different page than it opens.
      expect(
        sitePageForHref(resolveDestinationTarget(entry.target, location)),
      ).toBe(entry.page);
    }
  });

  it("keeps Liar's Dice searchable but unpromoted", () => {
    expect(COMMAND_ENTRIES).toContainEqual(
      expect.objectContaining({
        id: "destination-liars-dice",
        kind: "destination",
        promoted: false,
      }),
    );
  });

  it("excludes Golf, YouTube, and YouTube-backed talks from the registry", () => {
    const registryText = JSON.stringify(COMMAND_ENTRIES).toLowerCase();

    expect(registryText).not.toContain("golf");
    expect(registryText).not.toContain("youtube");
    expect(registryText).not.toContain("featured talks");
  });

  it("contains only the agreed first-release actions", () => {
    const actionIds = COMMAND_ENTRIES.filter(
      (entry) => entry.kind === "action",
    ).map((entry) => entry.actionId);

    expect(actionIds).toEqual([
      "theme-light",
      "theme-dark",
      "theme-system",
      "font-georgia",
      "font-literata",
      "font-system",
      "recents-clear",
    ]);
  });
});
