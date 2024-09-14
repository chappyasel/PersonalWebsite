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

async function fetchBlogPosts() {
  const response = await fetch(RSS_URL);
  const data = (await response.json()) as { items: unknown[] };
  const items = data.items.map((item: unknown) => ({
    title: item.title as string,
    pubDate: item.pubDate as string,
    link: item.link as string,
    guid: item.guid as string,
    author: item.author as string,
    thumbnail:
      (item.description as string)
        .toString()
        .match(/<img[^>]+src="([^">]+)"/)?.[1] ?? "",
    description: item.description as string,
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
