import type { BookLookup, NotionBlock } from "~/components/notion/types";

export type { NotionBlock, BookLookup };

export type RoutineData = {
  lastUpdated: string;
  /** The page's opening paragraphs, rich text so their links survive. */
  intro: NotionBlock[];
  whyEarly: NotionBlock[];
  timeline: {
    am: TimelineEntry[];
    pm: TimelineEntry[];
  };
  supplements: {
    am: Supplement[];
    pm: Supplement[];
  };
  rants: RoutineSection[];
};

export type TimelineEntry = {
  time: string;
  title: string;
  blocks: NotionBlock[];
};

export type RoutineSection = {
  id: string;
  title: string;
  icon: string;
  blocks: NotionBlock[];
};

export type Supplement = {
  name: string;
  link?: string;
  costPerDay: string;
  dosage: string;
  benefits: string;
};
