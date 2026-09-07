// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type { SystemsData } from "../../src/app/systems/types";
import { Client } from "@notionhq/client";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

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

const PAGE_ID = "3ccc5ab0d88d80ea91aef3dc2a823280";
const OUTPUT_PATH = join(__dirname, "../../public/data/systems.json");
const OUTPUT_DIR = join(__dirname, "../../public/data");
const IMAGES_DIR = join(__dirname, "../../public/images/systems");
const IMAGE_PATH_PREFIX = "/images/systems/";
const EMOJI_DIR = join(__dirname, "../../public/images/notion-emoji");
const EMOJI_PATH_PREFIX = "/images/notion-emoji/";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ─── Page Structure ───
//
// The top level of the page has two zones:
//
//   intro     everything before the first section: the opening paragraphs
//             and the Hamming quote
//   sections  every toggleable heading_1 (has_children); its children are the
//             section body. One section, the seven layers, is different: its
//             body is a run of heading_2 layers, each owning the flat blocks
//             that follow it up to the next heading_2. That section carries
//             `layers` instead of `blocks`, and every layer is its own anchor
//             so the At a Glance title links land on the layer.
//
// Sections and layers are read by position, not by heading text, so a
// renamed or reordered heading in Notion flows through without touching this
// file. A heading_1 with no children is a visual divider and is skipped. A
// flat block that turns up after the first section has no home and is
// dropped loudly.

/** "3. 📆 Planning & Review Cycles" → { number: 3, icon: "📆", title: "…" } */
function parseLayerHeading(text: string): {
  number: number | null;
  icon: string;
  title: string;
} {
  const numbered = /^(\d+)\.\s*(.*)$/s.exec(text.trim());
  const number = numbered ? Number(numbered[1]) : null;
  const { icon, title } = extractEmojiAndTitle(numbered ? numbered[2] : text);
  return { number, icon, title };
}

/**
 * A layer body groups its toggles under one-line emoji labels ("🧠
 * Knowledge", "❤️ Health") that Notion stores as plain paragraphs. A short
 * emoji-led paragraph immediately before a toggle is such a label and
 * becomes a level-3 heading so the page can set it as one.
 */
function promoteGroupLabels(blocks: any[]): any[] {
  return blocks.map((block, i) => {
    if (block.type !== "paragraph") return block;
    const next = blocks[i + 1];
    if (next?.type !== "toggle") return block;
    const text = block.content.map((r: any) => r.text).join("");
    if (!/^\p{Extended_Pictographic}️?\s+\S[^.!?:]{0,40}$/u.test(text)) {
      return block;
    }
    return { type: "heading", level: 3, content: block.content };
  });
}

async function processLayers(
  rawBlocks: any[],
  anchorMap: Record<string, string>,
) {
  const layers: any[] = [];
  let current: { layer: any; raw: any[]; ids: string[] } | null = null;

  const flush = async () => {
    if (!current) return;
    current.layer.blocks = promoteGroupLabels(
      await transformBlocks(current.raw, IMAGES_DIR, IMAGE_PATH_PREFIX),
    );
    for (const id of current.ids) anchorMap[id] = `#${current.layer.id}`;
    layers.push(current.layer);
    current = null;
  };

  for (const block of rawBlocks) {
    if (block.type === "heading_2") {
      await flush();
      const { number, icon, title } = parseLayerHeading(
        richTextToPlain(block.heading_2.rich_text),
      );
      current = {
        layer: { id: slugify(title), number, title, icon, blocks: [] },
        raw: [],
        ids: collectBlockIds(block),
      };
      continue;
    }
    if (!current) {
      console.warn(
        `  Dropped a stray ${block.type} block before the first layer`,
      );
      continue;
    }
    current.raw.push(block);
    current.ids.push(...collectBlockIds(block));
  }
  await flush();
  return layers;
}

async function processPage(rawBlocks: any[]): Promise<{
  intro: any[];
  sections: any[];
  anchorMap: Record<string, string>;
}> {
  const introRaw: any[] = [];
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
        const section: any = { id: slugify(title), title, icon };
        // The section anchor owns the heading itself; a layered body hands
        // its blocks to the layers below, and each layer owns its own ids.
        anchorMap[block.id.replace(/-/g, "")] = `#${section.id}`;
        const layered =
          block._children.some((c: any) => c.type === "heading_2") &&
          block._children.filter((c: any) => c.type === "toggle").length > 20;
        if (layered) {
          section.layers = await processLayers(block._children, anchorMap);
        } else {
          section.blocks = await transformBlocks(
            block._children,
            IMAGES_DIR,
            IMAGE_PATH_PREFIX,
          );
          for (const id of collectBlockIds(block)) {
            anchorMap[id] = `#${section.id}`;
          }
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
    introRaw.push(block);
  }

  const intro = await transformBlocks(introRaw, IMAGES_DIR, IMAGE_PATH_PREFIX);
  return { intro, sections, anchorMap };
}

/**
 * The intro's "tips for getting started" and "further reading" links point
 * at heading blocks that were deleted and re-created upstream, so their
 * fragments own nothing. The words still name a section; match them to one.
 */
function anchorByTitle(sections: any[]): (text: string) => string | null {
  const titles = sections.flatMap((s) => [
    { anchor: `#${s.id}`, title: s.title },
    ...(s.layers ?? []).map((l: any) => ({
      anchor: `#${l.id}`,
      title: l.title,
    })),
  ]);
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return (text) => {
    const needle = norm(text);
    if (!needle) return null;
    const hit = titles.find(
      (t) => norm(t.title) === needle || norm(t.title).includes(needle),
    );
    return hit?.anchor ?? null;
  };
}

function countToggles(blocks: any[]): number {
  let n = 0;
  const walk = (list: any[]) => {
    for (const b of list) {
      if (b.type === "toggle") {
        n++;
        walk(b.children);
      } else if (b.type === "callout") {
        walk(b.content);
      } else if (b.type === "bulleted_list" || b.type === "numbered_list") {
        for (const item of b.items) walk(item);
      }
    }
  };
  walk(blocks);
  return n;
}

/**
 * Notion keeps each At a Glance destination on a trailing "Read more" run.
 * On the site, the layer title is the link. RichTextRenderer then replaces
 * its leading emoji with the layer's Phosphor icon and uses the shared link
 * underline.
 */
function linkAtAGlanceTitles(data: SystemsData): SystemsData {
  const glance = data.sections.find((section) => section.id === "at-a-glance");
  if (!glance?.blocks) return data;

  const list = glance.blocks.find((block) => block.type === "numbered_list");
  if (list?.type !== "numbered_list") return data;

  for (const item of list.items) {
    const paragraph = item.find((block) => block.type === "paragraph");
    const content = paragraph?.content;
    if (!content?.length) continue;

    const hookIndex = content.findIndex(
      (run) =>
        Boolean(run.link) && /^\s*read more\s*(?:→|->)?\s*$/i.test(run.text),
    );
    if (hookIndex <= 0) continue;

    content[0]!.link = content[hookIndex]!.link;
    content.splice(hookIndex, 1);
    const last = content.at(-1);
    if (last?.text) last.text = last.text.trimEnd();
  }

  return data;
}

// ─── Main ───

async function main() {
  console.log("Fetching Personal Systems from Notion...");

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
  const { intro, sections, anchorMap } = await processPage(rawBlocks);

  console.log(`\nIntro: ${intro.length} block(s)`);
  console.log(`Found ${sections.length} sections:`);
  for (const s of sections) {
    if (s.layers) {
      console.log(`  ${s.icon} ${s.title} (${s.layers.length} layers)`);
      for (const l of s.layers) {
        console.log(
          `    ${l.number}. ${l.icon} ${l.title} (${l.blocks.length} blocks, ${countToggles(l.blocks)} toggles)`,
        );
      }
    } else {
      console.log(`  ${s.icon} ${s.title} (${s.blocks.length} blocks)`);
    }
  }

  // A page restructure that empties either zone is a generator bug, not a
  // content change. Refuse to overwrite a good snapshot with a hollow one.
  const layered = sections.find((s) => s.layers);
  if (intro.length === 0 || sections.length === 0 || !layered) {
    throw new Error(
      "Page structure not understood: intro, sections, or layers came back empty",
    );
  }

  // 4. Fetch workspace emoji referenced anywhere on the page
  const emoji = await downloadCustomEmoji(EMOJI_DIR, EMOJI_PATH_PREFIX);

  // 5. Self-links → local anchors, cross-page links → public URLs, custom
  //    emoji → downloaded files. The intro takes the same passes as the
  //    sections so its section links stay on the page.
  const output = linkAtAGlanceTitles(
    resolveCustomEmoji(
      rewriteNotionPageLinks(
        rewriteNotionSelfLinks(
          { lastUpdated, intro, sections },
          PAGE_ID,
          anchorMap,
          anchorByTitle(sections),
        ),
      ),
      emoji,
    ) as SystemsData,
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
