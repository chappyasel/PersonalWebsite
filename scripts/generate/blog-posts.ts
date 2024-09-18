// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RSS_URL =
  "https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@chappyasel";
const OUTPUT_PATH = join(__dirname, "../../public/data/blog-posts.json");
const OUTPUT_DIR = join(__dirname, "../../public/data");

/**
 * Strips HTML tags and converts HTML entities to plain text.
 * @param html - The HTML string to convert.
 * @returns The plain text representation of the HTML.
 */
function stripHtml(html: string): string {
  if (!html) return "";

  // Remove script and style tags and their content
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Replace <br> and <p> tags with newline characters
  text = text.replace(/<(br|p)[^>]*>/gi, "\n");

  // Remove all remaining HTML tags
  text = text.replace(/<\/?[^>]+(>|$)/g, "");

  // Decode common HTML entities
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&apos;": "'",
    "&ldquo;": "“",
    "&rdquo;": "”",
    "&lsquo;": "‘",
    "&rsquo;": "’",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "…",
    // Add more entities as needed
  };

  text = text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
    return entities[match] ?? match;
  });

  // Replace multiple consecutive newlines with a single newline
  text = text.replace(/\n{2,}/g, "\n\n");

  // Trim leading and trailing whitespace
  text = text.trim();

  return text;
}

async function fetchBlogPosts() {
  const response = await fetch(RSS_URL);
  const data = (await response.json()) as { items: unknown[] };
  const items = data.items.map((item) => ({
    title: item.title as string,
    pubDate: item.pubDate as string,
    link: item.link as string,
    guid: item.guid as string,
    author: item.author as string, // Ensure author is included
    thumbnail:
      (item.description as string).match(/<img[^>]+src="([^">]+)"/)?.[1] ?? "",
    description: stripHtml(item.description as string).slice(0, 1000),
  }));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify({ items }, null, 2));
}

fetchBlogPosts()
  .then(() => {
    console.log("Blog posts data saved successfully.");
  })
  .catch((error) => {
    console.error("Error in main function:", error);
  });
