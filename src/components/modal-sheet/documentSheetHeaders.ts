import manual from "../../../public/data/manual.json";
import routine from "../../../public/data/routine.json";
import systems from "../../../public/data/systems.json";

import { musings } from "~/lib/musings/content";
import { musingReadingMinutes } from "~/lib/musings/readingTime";

import type { NotionBlock } from "~/components/notion/types";

import type { DocumentSheetHeaders } from "./DocumentSheetLoading";

// The server sends only header content, never the full documents or essays.
// Loading and ready states render the same heroes with the same text wrapping.
export const documentSheetHeaders: DocumentSheetHeaders = {
  manual: {
    lead: manual.hero.lead as NotionBlock[],
    lastUpdated: manual.lastUpdated,
  },
  routine: {
    intro: routine.intro as NotionBlock[],
    lastUpdated: routine.lastUpdated,
  },
  systems: {
    intro: systems.intro as NotionBlock[],
    lastUpdated: systems.lastUpdated,
  },
  musings: Object.fromEntries(
    musings.map((article) => [
      `/musings/${article.slug}`,
      {
        title: article.title,
        author: article.author,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
        minutes: musingReadingMinutes({ searchText: article.text }),
      },
    ]),
  ),
};
