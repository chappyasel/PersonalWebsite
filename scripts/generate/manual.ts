// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Client } from "@notionhq/client";

import {
  collectBlockIds,
  downloadCustomEmoji,
  extractEmojiAndTitle,
  resolveCustomEmoji,
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
const EMOJI_DIR = join(__dirname, "../../public/images/notion-emoji");
const EMOJI_PATH_PREFIX = "/images/notion-emoji/";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ─── Page Structure ───
//
// The top level of the page has two zones:
//
//   hero      everything before the first section: a lead paragraph or two,
//             then heading_3 panels ("📌 TL;DR", "My 30-Second Self-Intro",
//             "My Personal Mission Statement", ...) each owning the flat
//             blocks that follow it up to the next heading
//   sections  every toggleable heading_1 (has_children); its children are the
//             section body, and every block id inside it maps to the
//             section's anchor so "Read more →" links land on-page
//
// The hero is read by position, not by heading text, so renaming, adding, or
// reordering a panel in Notion flows through without touching this file. A
// heading_1 with no children is a visual divider and is skipped. A flat block
// that turns up after the first section has no home and is dropped loudly.

async function processPage(rawBlocks: any[]): Promise<{
  hero: { lead: any[]; panels: any[] };
  sections: any[];
  anchorMap: Record<string, string>;
}> {
  const heroRaw: any[] = [];
  const sections: any[] = [];
  // Notion block ID (no dashes) → local anchor, for self-link rewriting
  const anchorMap: Record<string, string> = {};
  let sawSection = false;

  for (const block of rawBlocks) {
    if (block.type === "heading_1") {
      if (block.has_children && block._children) {
        sawSection = true;
        const titleText = richTextToPlain(block.heading_1.rich_text);
        const { icon, title } = extractEmojiAndTitle(titleText);
        const section = {
          id: slugify(title),
          title,
          icon,
          blocks: await transformBlocks(
            block._children,
            IMAGES_DIR,
            IMAGE_PATH_PREFIX,
          ),
        };
        // ManualSection renders id={section.id}, so fragments pointing at
        // this heading or anything inside it resolve to the section anchor
        for (const id of collectBlockIds(block)) {
          anchorMap[id] = `#${section.id}`;
        }
        sections.push(section);
      }
      continue;
    }

    if (sawSection) {
      console.warn(
        `  Dropped a stray ${block.type} block after the first section`,
      );
      continue;
    }
    heroRaw.push(block);
  }

  const hero = splitHero(
    await transformBlocks(heroRaw, IMAGES_DIR, IMAGE_PATH_PREFIX),
  );
  return { hero, sections, anchorMap };
}

/**
 * Blocks before the first heading are the lead; each heading opens a panel
 * that owns everything up to the next one. Empty paragraphs never reach here
 * (transformBlocks drops them), so a panel with no blocks is a heading with
 * nothing under it and is left out.
 */
function splitHero(blocks: any[]): { lead: any[]; panels: any[] } {
  const lead: any[] = [];
  const panels: any[] = [];
  let current: any = null;

  for (const block of blocks) {
    if (block.type === "heading") {
      const text = block.content.map((r: any) => r.text).join("");
      const { title } = extractEmojiAndTitle(text);
      current = { id: slugify(title), title, blocks: [] };
      panels.push(current);
      continue;
    }
    (current ? current.blocks : lead).push(block);
  }

  return { lead, panels: panels.filter((p) => p.blocks.length > 0) };
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

  console.log(
    `\nHero: ${hero.lead.length} lead block(s), ${hero.panels.length} panel(s)`,
  );
  for (const p of hero.panels) {
    console.log(`  ${p.title} (${p.blocks.length} blocks)`);
  }
  console.log(`Found ${sections.length} sections:`);
  for (const s of sections) {
    console.log(`  ${s.icon} ${s.title} (${s.blocks.length} blocks)`);
  }

  // A page restructure that empties either zone is a generator bug, not a
  // content change. Refuse to overwrite a good snapshot with a hollow one.
  if (hero.panels.length === 0 || sections.length === 0) {
    throw new Error(
      "Page structure not understood: hero panels or sections came back empty",
    );
  }

  // 4. Fetch workspace emoji referenced anywhere on the page
  const emoji = await downloadCustomEmoji(EMOJI_DIR, EMOJI_PATH_PREFIX);

  // 5. Self-links → local anchors, cross-page links → public URLs, custom
  //    emoji → downloaded files. The hero takes the same passes as the
  //    sections so its "Read more →" links stay on the page.
  const output = resolveCustomEmoji(
    rewriteNotionPageLinks(
      rewriteNotionSelfLinks({ lastUpdated, hero, sections }, PAGE_ID, anchorMap),
    ),
    emoji,
  );

  // 6. Write
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
