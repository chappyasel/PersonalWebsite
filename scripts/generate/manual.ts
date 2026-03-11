// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Client } from "@notionhq/client";

import {
  extractEmojiAndTitle,
  rewriteNotionPageLinks,
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
  personality: any;
}> {
  const sections: any[] = [];
  const heroRawBlocks: any[] = [];
  let inHero = false;
  let personality: any = {
    mbti: "ENTJ-A",
    bigFive: [],
    cliftonStrengths: [],
  };

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

        // Extract personality data
        if (
          title.toLowerCase().includes("personality") ||
          title.toLowerCase().includes("who i am")
        ) {
          personality = extractPersonalityData(sectionBlocks, personality);
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

  return { hero, sections, personality };
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

function extractPersonalityData(blocks: any[], existing: any): any {
  const result = { ...existing };
  const allText = JSON.stringify(blocks);

  // Extract Big Five scores
  const bigFiveTraits = [
    "Openness",
    "Conscientiousness",
    "Extraversion",
    "Agreeableness",
    "Neuroticism",
  ];

  for (const trait of bigFiveTraits) {
    // Match patterns like "Conscientiousness (114)" or "Conscientiousness: 95/100"
    const regexParen = new RegExp(`${trait}\\s*\\((\\d+)\\)`, "i");
    const regexColon = new RegExp(
      `${trait}[:\\s\\-–]+?(\\d+)\\s*(?:[/]\\s*(\\d+))?`,
      "i",
    );
    const matchParen = allText.match(regexParen);
    const matchColon = allText.match(regexColon);

    if (matchParen) {
      result.bigFive.push({
        trait,
        score: parseInt(matchParen[1]),
        max: 120, // NEO-PI-R scale
      });
    } else if (matchColon) {
      result.bigFive.push({
        trait,
        score: parseInt(matchColon[1]),
        max: matchColon[2] ? parseInt(matchColon[2]) : 100,
      });
    }
  }

  // Default Big Five if none found (NEO-PI-R scale, max ~120)
  if (result.bigFive.length === 0) {
    result.bigFive = [
      { trait: "Openness", score: 95, max: 120 },
      { trait: "Conscientiousness", score: 114, max: 120 },
      { trait: "Extraversion", score: 109, max: 120 },
      { trait: "Agreeableness", score: 61, max: 120 },
      { trait: "Neuroticism", score: 39, max: 120 },
    ];
  } else {
    // Fill in missing traits with defaults
    const defaultScores: Record<string, number> = {
      Openness: 95,
      Conscientiousness: 114,
      Extraversion: 109,
      Agreeableness: 61,
      Neuroticism: 39,
    };
    const foundTraits = new Set(result.bigFive.map((t: any) => t.trait));
    const max = result.bigFive[0]?.max ?? 120;
    for (const trait of bigFiveTraits) {
      if (!foundTraits.has(trait)) {
        result.bigFive.push({ trait, score: defaultScores[trait] ?? 80, max });
      }
    }
    // Ensure canonical order
    result.bigFive.sort(
      (a: any, b: any) =>
        bigFiveTraits.indexOf(a.trait) - bigFiveTraits.indexOf(b.trait),
    );
  }

  // Extract MBTI
  const mbtiMatch = allText.match(/\b([IE][NS][TF][JP])[\s-]*([AT])?\b/);
  if (mbtiMatch) {
    result.mbti = mbtiMatch[2]
      ? `${mbtiMatch[1]}-${mbtiMatch[2]}`
      : mbtiMatch[1];
  }

  // Extract CliftonStrengths
  const strengthDomains: Record<string, string> = {
    Achiever: "Executing",
    Arranger: "Executing",
    Belief: "Executing",
    Consistency: "Executing",
    Deliberative: "Executing",
    Discipline: "Executing",
    Focus: "Executing",
    Responsibility: "Executing",
    Restorative: "Executing",
    Activator: "Influencing",
    Command: "Influencing",
    Communication: "Influencing",
    Competition: "Influencing",
    Maximizer: "Influencing",
    "Self-Assurance": "Influencing",
    Significance: "Influencing",
    Woo: "Influencing",
    Adaptability: "Relationship Building",
    Connectedness: "Relationship Building",
    Developer: "Relationship Building",
    Empathy: "Relationship Building",
    Harmony: "Relationship Building",
    Includer: "Relationship Building",
    Individualization: "Relationship Building",
    Positivity: "Relationship Building",
    Relator: "Relationship Building",
    Analytical: "Strategic Thinking",
    Context: "Strategic Thinking",
    Futuristic: "Strategic Thinking",
    Ideation: "Strategic Thinking",
    Input: "Strategic Thinking",
    Intellection: "Strategic Thinking",
    Learner: "Strategic Thinking",
    Strategic: "Strategic Thinking",
  };

  const strengthNames = Object.keys(strengthDomains);
  const foundStrengths: any[] = [];

  for (const name of strengthNames) {
    const regex = new RegExp(`(\\d+)\\.?\\s*${name}\\b`, "i");
    const match = allText.match(regex);
    if (match) {
      foundStrengths.push({
        rank: parseInt(match[1]),
        name,
        domain: strengthDomains[name],
        description: "",
      });
    }
  }

  if (foundStrengths.length > 0) {
    result.cliftonStrengths = foundStrengths.sort(
      (a: any, b: any) => a.rank - b.rank,
    );
  }

  // Default strengths if none found
  if (result.cliftonStrengths.length === 0) {
    result.cliftonStrengths = [
      { rank: 1, name: "Achiever", domain: "Executing", description: "Driven by a constant need for accomplishment" },
      { rank: 2, name: "Learner", domain: "Strategic Thinking", description: "Energized by the journey from ignorance to competence" },
      { rank: 3, name: "Activator", domain: "Influencing", description: "Turns thoughts into action immediately" },
      { rank: 4, name: "Strategic", domain: "Strategic Thinking", description: "Creates alternative ways to proceed" },
      { rank: 5, name: "Command", domain: "Influencing", description: "Takes charge and makes decisions with presence" },
      { rank: 6, name: "Futuristic", domain: "Strategic Thinking", description: "Inspired by what the future could be" },
      { rank: 7, name: "Competition", domain: "Influencing", description: "Measures progress against others' performance" },
      { rank: 8, name: "Focus", domain: "Executing", description: "Sets a direction, follows through, and makes corrections" },
      { rank: 9, name: "Significance", domain: "Influencing", description: "Wants to make a big impact on the world" },
      { rank: 10, name: "Maximizer", domain: "Influencing", description: "Focuses on strengths to stimulate excellence" },
    ];
  }

  return result;
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
  const { hero, sections, personality } = await processPage(rawBlocks);

  console.log(`\nHero: ${hero.intro.length} intro bullets, mission: ${hero.missionStatement ? "yes" : "no"}, golden rule: ${hero.goldenRule ? "yes" : "no"}, ${hero.quickLinks.length} quick links`);
  console.log(`Personality: MBTI=${personality.mbti}, ${personality.bigFive.length} Big Five traits, ${personality.cliftonStrengths.length} strengths`);
  console.log(`Found ${sections.length} sections:`);
  for (const s of sections) {
    console.log(`  ${s.icon} ${s.title} (${s.blocks.length} blocks)`);
  }

  // 4. Rewrite Notion page links to public URLs
  const rewrittenSections = rewriteNotionPageLinks(sections);

  // 5. Assemble & write
  const output = { lastUpdated, hero, personality, sections: rewrittenSections };
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
