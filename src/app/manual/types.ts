import type {
  BookLookup,
  NotionBlock,
  RichText,
} from "~/components/notion/types";

// Re-export for convenience
export type { NotionBlock as ManualBlock, RichText, BookLookup };

export type ManualData = {
  lastUpdated: string;
  hero: {
    /** The page's opening paragraph(s), before the first hero heading. */
    lead: NotionBlock[];
    /**
     * One panel per heading above the first section, in page order: TL;DR,
     * the 30-second intro, the life purpose, and whatever Notion adds next.
     * The site does not know their names: the first becomes the body's
     * opening section and the rest its subheadings (ManualOverview).
     */
    panels: ManualHeroPanel[];
  };
  sections: ManualSection[];
};

export type ManualHeroPanel = {
  id: string;
  title: string;
  blocks: NotionBlock[];
};

export type ManualSection = {
  id: string;
  title: string;
  icon: string;
  blocks: NotionBlock[];
};
