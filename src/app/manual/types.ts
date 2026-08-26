import type { BookLookup, NotionBlock, RichText } from "~/components/notion/types";

// Re-export for convenience
export type { NotionBlock as ManualBlock, RichText, BookLookup };

export type ManualData = {
  lastUpdated: string;
  hero: {
    intro: string[];
    missionStatement: string;
    goldenRule: string;
    quickLinks: { label: string; url: string }[];
  };
  sections: ManualSection[];
};

export type ManualSection = {
  id: string;
  title: string;
  icon: string;
  blocks: NotionBlock[];
};
