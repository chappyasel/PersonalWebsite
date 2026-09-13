import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";
import { JSDOM } from "jsdom";

import { MEDIUM_SLUGS } from "./migration-slugs";

export function isMediumClapPrompt(text: string) {
  return (
    text.replace(/\s+/g, " ").trim() ===
    "Pro tip: you can give up to 50 claps for an article on Medium! Just click and hold the clap icon for few seconds and watch the magic happen! 😉"
  );
}

type RichTextItemRequest = Extract<
  BlockObjectRequest,
  { paragraph: unknown }
>["paragraph"]["rich_text"][number];

// The September 2026 account export left these three figures empty. Their
// destinations were recovered, in order, from medium.com/feed/@chappyasel.
const RECOVERED_EMBEDS: Record<string, Record<string, string>> = {
  b6cff9ad0220: {
    "7b4e": "https://x.com/karpathy/status/2039805659525644595",
    "543c": "https://x.com/himanshustwts/status/2039811786602607052",
    "9695": "https://x.com/karpathy/status/2030371219518931079",
  },
};

export type MediumArticle = {
  title: string;
  summary: string;
  publishedAt: string;
  mediumUrl: string;
  mediumId: string;
  slug: string;
  author: string;
  blocks: BlockObjectRequest[];
  imageUrls: string[];
  text: string;
  missingEmbeds: string[];
};

export function richText(text: string): RichTextItemRequest[] {
  const runs: RichTextItemRequest[] = [];
  // Keep surrogate pairs together and leave room under Notion's 2,000-unit limit.
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 900)
    runs.push({
      type: "text",
      text: { content: chars.slice(i, i + 900).join("") },
    });
  return runs;
}

function inline(
  node: Node,
  annotations: {
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
  } = {},
  href?: string,
): RichTextItemRequest[] {
  if (node.nodeType === 3)
    return richText(node.textContent ?? "").map((r) => ({
      ...r,
      annotations,
      ...(r.type === "text" && href
        ? { text: { ...r.text, link: { url: href } } }
        : {}),
    }));
  if (node.nodeType !== 1) return [];
  const e = node as Element;
  if (e.tagName === "BR") return richText("\n");
  const next = { ...annotations };
  if (["STRONG", "B"].includes(e.tagName)) next.bold = true;
  if (["EM", "I"].includes(e.tagName)) next.italic = true;
  if (e.tagName === "CODE") next.code = true;
  if (["S", "DEL"].includes(e.tagName)) next.strikethrough = true;
  if (e.tagName === "U") next.underline = true;
  const link = e.tagName === "A" ? (e.getAttribute("href") ?? href) : href;
  const safeLink = link && /^(https?:|mailto:)/i.test(link) ? link : undefined;
  return [...e.childNodes].flatMap((n) => inline(n, next, safeLink));
}

export function parseMedium(html: string): MediumArticle | null {
  const document = new JSDOM(html).window.document;
  const body = document.querySelector(".e-content");
  const title = document.querySelector("h1.p-name")?.textContent?.trim();
  const publishedAt = document
    .querySelector("time.dt-published")
    ?.getAttribute("datetime");
  const mediumUrl = document
    .querySelector("a.p-canonical")
    ?.getAttribute("href");
  if (!body || !title || !publishedAt || !mediumUrl) return null;
  // In this export, replies have no authored title block and no images.
  // Keep classification explicit; never infer publication from a filename date.
  if (!body.querySelector(".graf--title") && !body.querySelector("img"))
    return null;
  const mediumId = mediumUrl.match(/-([a-f0-9]{12})$/)?.[1];
  if (!mediumId) throw new Error(`Cannot identify Medium article: ${title}`);
  const slug =
    MEDIUM_SLUGS[mediumId] ??
    new URL(mediumUrl).pathname
      .split("/")
      .at(-1)!
      .replace(/-[a-f0-9]{12}$/, "");
  body.querySelector(".graf--title")?.remove();
  // The author removed this Medium-specific footer from the migrated editions.
  for (const paragraph of body.querySelectorAll("p")) {
    if (isMediumClapPrompt(paragraph.textContent ?? "")) paragraph.remove();
  }
  const images: string[] = [];
  const missingEmbeds: string[] = [];
  function convert(e: Element): BlockObjectRequest[] {
    const rt = () => inline(e);
    const wrap = (
      type:
        | "paragraph"
        | "heading_2"
        | "heading_3"
        | "quote"
        | "bulleted_list_item"
        | "numbered_list_item",
      content = rt(),
    ): BlockObjectRequest =>
      ({
        object: "block",
        type,
        [type]: { rich_text: content },
      }) as BlockObjectRequest;
    if (e.matches(".section-divider")) return [];
    switch (e.tagName) {
      case "A":
        return e.textContent?.trim() ? [wrap("paragraph")] : [];
      case "P":
        return [wrap("paragraph")];
      case "H1":
      case "H2":
      case "H3":
        return [wrap("heading_2")];
      case "H4":
      case "H5":
      case "H6":
        return [wrap("heading_3")];
      case "BLOCKQUOTE":
        return [wrap("quote")];
      case "LI":
        return [
          wrap(
            e.parentElement?.tagName === "OL"
              ? "numbered_list_item"
              : "bulleted_list_item",
          ),
        ];
      case "FIGURE": {
        const caption = e.querySelector("figcaption");
        const result = [...e.querySelectorAll("img")].map(
          (img): BlockObjectRequest => {
            const url = img.getAttribute("src");
            if (!url?.startsWith("https://"))
              throw new Error(`Invalid image in ${title}`);
            images.push(url);
            return {
              object: "block",
              type: "image",
              image: {
                type: "external",
                external: { url },
                caption: caption
                  ? inline(caption)
                  : richText(img.getAttribute("alt") ?? ""),
              },
            };
          },
        );
        for (const iframe of e.querySelectorAll("iframe")) {
          const url = iframe.getAttribute("src");
          if (!url?.startsWith("https://"))
            throw new Error(`Invalid embed in ${title}`);
          result.push({
            object: "block",
            type: "video",
            video: {
              type: "external",
              external: { url },
              caption: caption ? inline(caption) : [],
            },
          });
        }
        if (
          !result.length &&
          e.matches(".graf--iframe") &&
          !e.textContent?.trim()
        ) {
          const recovered = RECOVERED_EMBEDS[mediumId!]?.[e.id];
          if (recovered)
            return [
              {
                object: "block",
                type: "bookmark",
                bookmark: {
                  url: recovered,
                  caption: richText("Referenced post on X"),
                },
              },
            ];
          missingEmbeds.push(e.id);
          return [];
        }
        if (!result.length) throw new Error(`Unsupported figure in ${title}`);
        return result;
      }
      case "PRE":
        return [
          {
            object: "block",
            type: "code",
            code: {
              rich_text: richText(e.textContent ?? ""),
              language: "plain text",
            },
          },
        ];
      case "HR":
        return [{ object: "block", type: "divider", divider: {} }];
      case "SECTION":
      case "DIV":
      case "UL":
      case "OL":
        return [...e.children].flatMap(convert);
      default:
        throw new Error(`Unsupported Medium element ${e.tagName} in ${title}`);
    }
  }
  const blocks = [...body.children].flatMap(convert);
  return {
    title,
    summary: document.querySelector(".p-summary")?.textContent?.trim() ?? "",
    publishedAt,
    mediumUrl,
    mediumId,
    slug,
    author:
      mediumId === "5552e27eeece" ? "Paul Asel and Chappy Asel" : "Chappy Asel",
    blocks,
    imageUrls: images,
    text: body.textContent ?? "",
    missingEmbeds,
  };
}
