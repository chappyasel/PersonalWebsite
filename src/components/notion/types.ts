export type NotionBlock =
  | { type: "paragraph"; content: RichText[] }
  | { type: "heading"; level: 2 | 3; content: RichText[] }
  | { type: "callout"; icon: string; color: string; content: NotionBlock[] }
  | { type: "toggle"; title: RichText[]; children: NotionBlock[] }
  | { type: "bulleted_list"; items: NotionBlock[][] }
  | { type: "numbered_list"; items: NotionBlock[][] }
  | { type: "image"; src: string; alt: string }
  | { type: "divider" }
  | { type: "quote"; content: RichText[] }
  | {
      type: "table";
      headers: string[];
      rows: Array<Record<string, { text: string; link?: string }>>;
    };

export type RichText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  color?: string;
  link?: string;
};

export type BookLookup = Record<string, { title: string; coverUrl: string | null }>;
