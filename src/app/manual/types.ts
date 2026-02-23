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
  blocks: ManualBlock[];
};

export type ManualBlock =
  | { type: "paragraph"; content: RichText[] }
  | { type: "heading"; level: 2 | 3; content: RichText[] }
  | { type: "callout"; icon: string; color: string; content: ManualBlock[] }
  | { type: "toggle"; title: RichText[]; children: ManualBlock[] }
  | { type: "bulleted_list"; items: ManualBlock[][] }
  | { type: "numbered_list"; items: ManualBlock[][] }
  | { type: "image"; src: string; alt: string }
  | { type: "divider" }
  | { type: "quote"; content: RichText[] };

export type RichText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  color?: string;
  link?: string;
};

export type BookLookup = Record<
  string,
  { title: string; coverUrl: string | null }
>;

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
