// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RSS_URL =
  "https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@chappyasel";
const OUTPUT_PATH = join(__dirname, "../../public/data/blog-posts.json");
const OUTPUT_DIR = join(__dirname, "../../public/data");

/**
 * Musings that did not go out through Medium and so never reach the RSS
 * feed. Written ahead of the fetched items, newest first, so a regeneration
 * cannot drop them. The first six items become the spines on the Musings
 * shelf (src/app/page.tsx), which is why order matters here.
 */
const PINNED_POSTS = [
  {
    // Owner request 2026-08-22: #1 on the list and a booklet on the shelf.
    title: "Trust in the Age of Acceleration",
    pubDate: "2025-04-03 16:00:00",
    link: "https://www.aicollective.com/trust",
    guid: "https://www.aicollective.com/trust",
    author: "Chappy Asel",
    thumbnail: "https://www.aicollective.com/images/trust/opengraph-image.jpg",
    thumbnailWidth: 1200,
    thumbnailHeight: 630,
    description:
      "Holding Society Together When Everything Is Moving Faster Than We Can Understand. How to build and preserve social trust amid AI acceleration and transformative technological change.",
  },
];

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
  const items = await Promise.all(
    data.items.map(async (item) => {
      const thumbnail =
        (item.description as string).match(/<img[^>]+src="([^">]+)"/)?.[1] ??
        "";
      let thumbnailWidth = 1024;
      let thumbnailHeight = 512;

      if (thumbnail) {
        try {
          const imageResponse = await fetch(thumbnail);
          const metadata = await sharp(
            Buffer.from(await imageResponse.arrayBuffer()),
          ).metadata();
          thumbnailWidth = metadata.width ?? thumbnailWidth;
          thumbnailHeight = metadata.height ?? thumbnailHeight;
        } catch {
          // Keep a stable fallback ratio if Medium's CDN is unavailable.
        }
      }

      return {
        title: item.title as string,
        pubDate: item.pubDate as string,
        link: item.link as string,
        guid: item.guid as string,
        author: item.author as string,
        thumbnail,
        thumbnailWidth,
        thumbnailHeight,
        description: stripHtml(item.description as string).slice(0, 1000),
      };
    }),
  );

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ items: [...PINNED_POSTS, ...items] }, null, 2),
  );
}

fetchBlogPosts()
  .then(() => {
    console.log("Blog posts data saved successfully.");
  })
  .catch((error) => {
    console.error("Error in main function:", error);
  });
