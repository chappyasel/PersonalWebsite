export type NotionBlock =
  | { type: "paragraph"; content: RichText[] }
  | { type: "heading"; level: 2 | 3; content: RichText[] }
  | { type: "callout"; icon: string; color: string; content: NotionBlock[] }
  | { type: "toggle"; title: RichText[]; children: NotionBlock[] }
  | { type: "bulleted_list"; items: NotionBlock[][] }
  | { type: "numbered_list"; items: NotionBlock[][] }
  | {
      type: "image";
      src: string;
      alt: string;
      /** Line art on a light ground: safe to invert in dark mode. Set by the
       * sync from the pixels, or forced with [invert] / [no-invert] in the
       * Notion caption. */
      invert?: boolean;
    }
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
  /**
   * A workspace emoji (":sunsama:"). The generator downloads the file and
   * records where it landed; the renderer shows it inline instead of the
   * shortcode text.
   */
  customEmoji?: { name: string; src: string };
};

/**
 * What an inline book link knows about its book: enough for the cover, the
 * title, and the hover card. Dates are ISO strings because the lookup runs
 * on the server and the card renders on the client. Built by
 * `lookupInlineBooks` in src/lib/books/inlineLookup.ts.
 */
export type BookLookupEntry = {
  title: string;
  author: string;
  coverUrl: string | null;
  rating: number | null;
  started: string | null;
  finished: string | null;
  abandoned: string | null;
  abandonedAtMin: number | null;
  audioLengthMin: number | null;
  pageCount: number | null;
  hasNotes: boolean;
};

export type BookLookup = Record<string, BookLookupEntry>;
