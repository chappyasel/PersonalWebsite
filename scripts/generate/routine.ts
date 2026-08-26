// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Client } from "@notionhq/client";

import {
  collectBlockIds,
  downloadFile,
  extractEmojiAndTitle,
  getImageExtension,
  rewriteNotionPageLinks,
  rewriteNotionSelfLinks,
  richTextToPlain,
  slugify,
  transformBlocks,
  transformRichText,
  walkBlocks,
} from "./notion-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PAGE_ID = "151c5ab0d88d80f3a0efcf2e04f18a56";
const OUTPUT_PATH = join(__dirname, "../../public/data/routine.json");
const OUTPUT_DIR = join(__dirname, "../../public/data");
const IMAGES_DIR = join(__dirname, "../../public/images/routine");
const IMAGE_PATH_PREFIX = "/images/routine/";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ─── Table Parsing ───

function parseSupplementTable(block: any): any[] {
  if (!block._children) return [];

  const rows = block._children.filter((c: any) => c.type === "table_row");
  if (rows.length < 2) return [];

  // First row is headers
  const headerRow = rows[0];
  const headers = headerRow.table_row.cells.map((cell: any) =>
    richTextToPlain(cell).trim().toLowerCase(),
  );

  const supplements: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.table_row.cells;

    const getCell = (headerName: string) => {
      const idx = headers.indexOf(headerName);
      if (idx === -1 || idx >= cells.length) return "";
      return richTextToPlain(cells[idx]).trim();
    };

    const getCellLink = (headerName: string) => {
      const idx = headers.indexOf(headerName);
      if (idx === -1 || idx >= cells.length) return undefined;
      const cell = cells[idx];
      for (const rt of cell) {
        if (rt.href) return rt.href;
      }
      return undefined;
    };

    const name = getCell("name");
    if (!name) continue;

    supplements.push({
      name,
      link: getCellLink("name"),
      costPerDay: getCell("$/day"),
      dosage: getCell("dosage"),
      benefits: getCell("benefits"),
    });
  }

  return supplements;
}

// ─── Timeline Entry Parsing ───

function titleCase(str: string): string {
  return str.replace(
    /(?:^|\s|["\u201c\u201d(-])([a-z])/g,
    (match) => match.toUpperCase(),
  );
}

function parseTimeFromTitle(titleText: string): { time: string; title: string } {
  // Match patterns like "3:45am: wake up" or "**3:45am: wake up**"
  const match = titleText.match(
    /\*{0,2}(\d{1,2}:\d{2}\s*(?:am|pm)):?\s*(.*?)\*{0,2}$/i,
  );
  if (match) {
    return {
      time: match[1].trim().toLowerCase(),
      title: titleCase(match[2].replace(/\*+$/g, "").trim()),
    };
  }
  return { time: "", title: titleCase(titleText) };
}

// ─── Notion Link Rewriting ───
//
// Self-page mention links (Notion fragments) are rewritten to local section
// anchors via an anchor map built during processing: every heading that
// becomes a section registers its own block ID and all descendant block IDs,
// so a fragment pointing anywhere inside a section lands on that section.

// ─── Image Handling ───

async function downloadImage(block: any): Promise<string | null> {
  const imgData = block.image;
  const url = imgData.file?.url ?? imgData.external?.url ?? "";
  if (!url) return null;

  const ext = getImageExtension(url);
  const filename = `${block.id}.${ext}`;
  const localPath = `${IMAGE_PATH_PREFIX}${filename}`;
  const destPath = join(IMAGES_DIR, filename);

  if (!existsSync(destPath)) {
    try {
      await downloadFile(url, destPath);
      console.log(`  Downloaded image: ${filename}`);
    } catch (err) {
      console.warn(`  Failed to download image ${block.id}:`, err.message);
      return null;
    }
  }

  return localPath;
}

// ─── Page Processing ───
//
// The Notion page has FLAT sibling blocks (not nested under headings):
//   paragraph (intro)
//   heading_1 "Why So Early?" (toggleable, has_children=true → children are the content)
//   heading_1 "The Routine™️" (NOT toggleable, has_children=false)
//   heading_2 "🌅 AM" (flat sibling)
//   toggle "3:45am: wake up" (flat sibling)
//   toggle "4:30am: pre-workout" (flat sibling)
//   ...
//   heading_2 "🌆 PM" (flat sibling)
//   toggle "7:00pm: sunset" (flat sibling)
//   ...
//   heading_1 "Related Rants" (NOT toggleable, has_children=false)
//   heading_2 "📈 Sinusoidal..." (toggleable, has_children=true → children are content)
//   heading_2 "☕ Caffeine" (toggleable, has_children=true)
//   ...

async function processPage(rawBlocks: any[]) {
  let intro = "";
  const whyEarlyBlocks: any[] = [];
  const amEntries: any[] = [];
  const pmEntries: any[] = [];
  const amSupplements: any[] = [];
  const pmSupplements: any[] = [];
  const rants: any[] = [];

  // Notion block ID (no dashes) → local anchor, for self-link rewriting
  const anchorMap: Record<string, string> = {};
  function registerAnchor(block: any, anchor: string) {
    for (const id of collectBlockIds(block)) anchorMap[id] = anchor;
  }

  let currentSection = "intro"; // intro | why-early | routine | rants
  let currentSubSection = "am"; // am | pm (within routine)
  let currentRantTitle = "";
  let currentRantIcon = "";
  let currentRantBlocks: any[] = [];

  function flushRant() {
    if (currentRantTitle && currentRantBlocks.length > 0) {
      rants.push({
        id: slugify(currentRantTitle),
        title: currentRantTitle,
        icon: currentRantIcon,
        blocks: currentRantBlocks,
      });
    }
    currentRantBlocks = [];
    currentRantTitle = "";
    currentRantIcon = "";
  }

  for (const block of rawBlocks) {
    // ── heading_1: section boundaries ──
    if (block.type === "heading_1") {
      const titleText = richTextToPlain(block.heading_1.rich_text);

      if (titleText.toLowerCase().includes("why so early")) {
        currentSection = "why-early";
        // The page renders this section as id="why-early" (see page.tsx)
        registerAnchor(block, "#why-early");
        // This is a toggleable heading — its children ARE the content
        if (block._children) {
          const transformed = await transformBlocks(
            block._children,
            IMAGES_DIR,
            IMAGE_PATH_PREFIX,
          );
          whyEarlyBlocks.push(...transformed);
        }
        continue;
      }

      if (titleText.toLowerCase().includes("routine")) {
        currentSection = "routine";
        currentSubSection = "am";
        continue;
      }

      if (titleText.toLowerCase().includes("related rants")) {
        flushRant();
        currentSection = "rants";
        continue;
      }

      continue;
    }

    // ── heading_2: sub-section markers ──
    if (block.type === "heading_2") {
      const titleText = richTextToPlain(block.heading_2.rich_text);

      if (currentSection === "routine") {
        // AM/PM markers; RoutineTimeline renders them as id="morning"/"evening"
        if (titleText.includes("AM")) {
          currentSubSection = "am";
          registerAnchor(block, "#morning");
        } else if (titleText.includes("PM")) {
          currentSubSection = "pm";
          registerAnchor(block, "#evening");
        }
        continue;
      }

      if (currentSection === "rants") {
        // Each heading_2 is a rant section (toggleable with children)
        flushRant();
        const { icon, title } = extractEmojiAndTitle(titleText);
        currentRantTitle = title;
        currentRantIcon = icon;
        registerAnchor(block, `#${slugify(title)}`);

        if (block._children) {
          const transformed = await transformBlocks(
            block._children,
            IMAGES_DIR,
            IMAGE_PATH_PREFIX,
          );

          // Extract supplement tables from rant children and separate them
          for (const child of block._children) {
            if (child.type === "table" && child._children) {
              const supplements = parseSupplementTable(child);
              if (supplements.length > 0) {
                // Check first data row's Time column for AM/PM
                const firstDataRow = child._children.find(
                  (r: any) => r.type === "table_row" && child._children.indexOf(r) > 0,
                );
                if (firstDataRow) {
                  const cells = firstDataRow.table_row?.cells ?? [];
                  const timeCell = richTextToPlain(cells[0] ?? [])
                    .trim()
                    .toUpperCase();
                  if (timeCell === "PM") {
                    pmSupplements.push(...supplements);
                  } else {
                    amSupplements.push(...supplements);
                  }
                }
              }
            }
          }

          currentRantBlocks.push(...transformed);
        }
        continue;
      }

      continue;
    }

    // ── toggle: timeline entries (flat siblings under routine) ──
    if (block.type === "toggle" && currentSection === "routine") {
      registerAnchor(
        block,
        currentSubSection === "pm" ? "#evening" : "#morning",
      );
      const titleText = richTextToPlain(block.toggle.rich_text);
      const { time, title } = parseTimeFromTitle(titleText);

      const blocks = block._children
        ? await transformBlocks(block._children, IMAGES_DIR, IMAGE_PATH_PREFIX)
        : [];

      const timelineEntry = { time, title, blocks };

      if (currentSubSection === "pm") {
        pmEntries.push(timelineEntry);
      } else {
        amEntries.push(timelineEntry);
      }
      continue;
    }

    // ── intro paragraph (before any heading_1) ──
    if (currentSection === "intro" && block.type === "paragraph") {
      const text = richTextToPlain(block.paragraph.rich_text);
      if (text.trim()) intro = text.trim();
    }
  }

  flushRant();

  return {
    result: {
      intro,
      whyEarly: whyEarlyBlocks,
      timeline: { am: amEntries, pm: pmEntries },
      supplements: { am: amSupplements, pm: pmSupplements },
      rants,
    },
    anchorMap,
  };
}

// ─── Main ───

async function main() {
  console.log("Fetching Core Daily Routine from Notion...");

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
  const { result, anchorMap } = await processPage(rawBlocks);

  console.log(`\nIntro: ${result.intro ? "yes" : "no"}`);
  console.log(`Why Early: ${result.whyEarly.length} blocks`);
  console.log(`AM Timeline: ${result.timeline.am.length} entries`);
  for (const e of result.timeline.am) {
    console.log(`  ${e.time}: ${e.title} (${e.blocks.length} blocks)`);
  }
  console.log(`PM Timeline: ${result.timeline.pm.length} entries`);
  for (const e of result.timeline.pm) {
    console.log(`  ${e.time}: ${e.title} (${e.blocks.length} blocks)`);
  }
  console.log(
    `Supplements: ${result.supplements.am.length} AM, ${result.supplements.pm.length} PM`,
  );
  console.log(`Related Rants: ${result.rants.length} sections`);
  for (const r of result.rants) {
    console.log(`  ${r.icon} ${r.title} (${r.blocks.length} blocks)`);
  }

  // 4. Rewrite Notion self-links to local anchors, then cross-page links to public URLs
  const rewritten = rewriteNotionPageLinks(
    rewriteNotionSelfLinks(result, PAGE_ID, anchorMap),
  );

  // 5. Assemble & write
  const output = { lastUpdated, ...rewritten };
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
