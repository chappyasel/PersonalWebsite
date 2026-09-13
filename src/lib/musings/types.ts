export type MusingText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: string;
};
export type MusingImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
};
export type MusingBlock =
  | {
      type: "paragraph" | "quote" | "bulleted_list_item" | "numbered_list_item";
      content: MusingText[];
      children?: MusingBlock[];
    }
  | { type: "heading"; level: 2 | 3; id: string; content: MusingText[] }
  | { type: "image"; image: MusingImage; caption: MusingText[] }
  | { type: "link"; url: string; content: MusingText[] }
  | { type: "code"; text: string; language: string }
  | { type: "divider" }
  | { type: "toggle"; content: MusingText[]; children: MusingBlock[] };
export type MusingArticle = {
  slug: string;
  title: string;
  description: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  mediumUrl: string | null;
  cover: MusingImage | null;
  blocks: MusingBlock[];
  text: string;
  contentHash: string;
};

export const MUSINGS_ORIGIN = "https://www.chappyasel.com";
export const musingPath = (slug: string) => `/musings/${slug}`;
export const musingUrl = (slug: string) =>
  `${MUSINGS_ORIGIN}${musingPath(slug)}`;
export const validMusingSlug = (slug: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
  !["feed", "feed-xml"].includes(slug);
export function safeMusingLink(value: string): string | undefined {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return value;
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(value).protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
export function musingBlockText(blocks: MusingBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "code") return block.text;
      if (block.type === "divider") return "";
      const text = (block.type === "image" ? block.caption : block.content)
        .map((r) => r.text)
        .join("");
      return (
        text +
        ("children" in block && block.children
          ? `\n${musingBlockText(block.children)}`
          : "")
      );
    })
    .join("\n\n");
}
