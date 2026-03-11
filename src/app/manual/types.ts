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
  personality: PersonalityData;
  sections: ManualSection[];
};

export type ManualSection = {
  id: string;
  title: string;
  icon: string;
  blocks: NotionBlock[];
};

export type PersonalityData = {
  mbti: string;
  bigFive: { trait: string; score: number; max: number }[];
  cliftonStrengths: {
    rank: number;
    name: string;
    domain: string;
    description: string;
  }[];
};
