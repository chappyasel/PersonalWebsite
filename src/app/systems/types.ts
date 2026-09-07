import type { BookLookup, NotionBlock, RichText } from "~/components/notion/types";

// Re-export for convenience
export type { NotionBlock as SystemsBlock, RichText, BookLookup };

export type SystemsData = {
  lastUpdated: string;
  /** The page's opening paragraphs and the Hamming quote, before the first
   * section. */
  intro: NotionBlock[];
  /** Every toggleable heading_1 on the page, in page order. The site does
   * not know them by name; it renders the layered one differently. */
  sections: SystemsSection[];
};

export type SystemsSection = {
  id: string;
  title: string;
  icon: string;
} & (
  | { blocks: NotionBlock[]; layers?: undefined }
  | { layers: SystemsLayer[]; blocks?: undefined }
);

/** One of the seven layers: a heading_2 inside the layered section plus the
 * blocks that follow it up to the next heading_2. Its own anchor. */
export type SystemsLayer = {
  id: string;
  /** The "3." in "3. 📆 Planning & Review Cycles", when the heading carries one. */
  number: number | null;
  title: string;
  icon: string;
  blocks: NotionBlock[];
};
