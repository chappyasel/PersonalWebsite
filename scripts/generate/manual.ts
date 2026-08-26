// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Client } from "@notionhq/client";

import {
  collectBlockIds,
  extractEmojiAndTitle,
  rewriteNotionPageLinks,
  rewriteNotionSelfLinks,
  richTextToPlain,
  slugify,
  transformBlocks,
  walkBlocks,
} from "./notion-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PAGE_ID = "253c5ab0d88d80888643c64e7dbe5d0c";
const OUTPUT_PATH = join(__dirname, "../../public/data/manual.json");
const OUTPUT_DIR = join(__dirname, "../../public/data");
const IMAGES_DIR = join(__dirname, "../../public/images/manual");
const IMAGE_PATH_PREFIX = "/images/manual/";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ─── Section Extraction ───

/**
 * The page structure:
 *   heading_1 "📌 TL;DR" (no children)
 *   heading_3, bulleted_list_item, paragraph, etc. (flat hero content)
 *   heading_1 "🧬 Personality..." (has_children = true) → children are section content
 *   heading_1 "🤝 How We Collaborate" (has_children = true) → children
 *   ...etc
 *
 * So we process raw Notion blocks to split them into:
 * - Hero: everything from TL;DR heading_1 until the next heading_1
 * - Sections: each heading_1 with has_children=true
 */
async function processPage(rawBlocks: any[]): Promise<{
  hero: any;
  sections: any[];
  anchorMap: Record<string, string>;
}> {
  const sections: any[] = [];
  const heroRawBlocks: any[] = [];
  let inHero = false;

  // Notion block ID (no dashes) → local anchor, for self-link rewriting
  const anchorMap: Record<string, string> = {};

  for (const block of rawBlocks) {
    if (block.type === "heading_1") {
      const titleText = richTextToPlain(block.heading_1.rich_text);
      const { icon, title } = extractEmojiAndTitle(titleText);

      if (!inHero && titleText.toLowerCase().includes("tl;dr")) {
        // Start of hero section (flat blocks follow)
        inHero = true;
        continue;
      }

      if (block.has_children && block._children) {
        // This is a section with children
        inHero = false;
        const sectionBlocks = await transformBlocks(
          block._children,
          IMAGES_DIR,
          IMAGE_PATH_PREFIX,
        );

        const section = {
          id: slugify(title),
          title,
          icon,
          blocks: sectionBlocks,
        };

        // ManualSection renders id={section.id}, so fragments pointing at
        // this heading or anything inside it resolve to the section anchor
        for (const id of collectBlockIds(block)) {
          anchorMap[id] = `#${section.id}`;
        }

        sections.push(section);
      } else {
        inHero = false;
      }
    } else if (inHero) {
      heroRawBlocks.push(block);
    }
  }

  // Transform hero blocks
  const heroTransformed = await transformBlocks(
    heroRawBlocks,
    IMAGES_DIR,
    IMAGE_PATH_PREFIX,
  );
  const hero = extractHeroData(heroTransformed);

  return { hero, sections, anchorMap };
}

function extractHeroData(blocks: any[]): any {
  const intro: string[] = [];
  let missionStatement = "";
  let goldenRule = "";
  const quickLinks: { label: string; url: string }[] = [];

  let currentHeading = "";

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 3) {
      const text = block.content.map((r: any) => r.text).join("");
      currentHeading = text.toLowerCase();
      continue;
    }

    if (currentHeading.includes("introduction") || currentHeading.includes("30-second")) {
      if (block.type === "bulleted_list") {
        for (const item of block.items) {
          const text = item
            .filter((b: any) => b.type === "paragraph")
            .map((b: any) => b.content.map((r: any) => r.text).join(""))
            .join("");
          if (text) intro.push(text);
        }
      }
    } else if (currentHeading.includes("mission")) {
      if (block.type === "paragraph") {
        const text = block.content.map((r: any) => r.text).join("");
        if (text) missionStatement = text;
      }
    } else if (currentHeading.includes("golden rule")) {
      if (block.type === "paragraph") {
        const text = block.content.map((r: any) => r.text).join("");
        if (text) goldenRule = text;
      }
    } else if (currentHeading.includes("quick links")) {
      if (block.type === "bulleted_list") {
        for (const item of block.items) {
          for (const b of item) {
            if (b.type === "paragraph") {
              for (const rt of b.content) {
                if (rt.link) {
                  quickLinks.push({ label: rt.text, url: rt.link });
                } else {
                  // Check for "Label: url" pattern
                  const parts = rt.text.split(": ");
                  if (parts.length === 2 && parts[1].includes(".")) {
                    quickLinks.push({
                      label: parts[0].trim(),
                      url: `https://${parts[1].trim()}`,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { intro, missionStatement, goldenRule, quickLinks };
}

// ─── Main ───

async function main() {
  console.log("Fetching Personal Operating Manual from Notion...");

  // 1. Get page metadata
  const page = await notion.pages.retrieve({ page_id: PAGE_ID });
  const lastUpdated = (page as any).last_edited_time;
  console.log(`Last updated: ${lastUpdated}`);

  // 2. Recursively fetch all blocks
  console.log("Fetching blocks...");
  const rawBlocks = await walkBlocks(PAGE_ID, notion);
  console.log(`Fetched ${rawBlocks.length} top-level blocks`);

  // 3. Process into structured data
  console.log("Processing blocks...");
  mkdirSync(IMAGES_DIR, { recursive: true });
  const { hero, sections, anchorMap } = await processPage(rawBlocks);

  console.log(`\nHero: ${hero.intro.length} intro bullets, mission: ${hero.missionStatement ? "yes" : "no"}, golden rule: ${hero.goldenRule ? "yes" : "no"}, ${hero.quickLinks.length} quick links`);
  console.log(`Found ${sections.length} sections:`);
  for (const s of sections) {
    console.log(`  ${s.icon} ${s.title} (${s.blocks.length} blocks)`);
  }

  // 4. Rewrite Notion self-links to local anchors, then cross-page links to public URLs
  const rewrittenSections = rewriteNotionPageLinks(
    rewriteNotionSelfLinks(sections, PAGE_ID, anchorMap),
  );

  // 5. Assemble & write
  const output = { lastUpdated, hero, sections: rewrittenSections };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${OUTPUT_PATH}`);
  console.log(
    `File size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`,
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
