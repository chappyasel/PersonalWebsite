import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import rawData from "~~/data/manual.json";

import type { ManualData } from "./types";

const data = rawData as unknown as ManualData;
const text = JSON.stringify(data);
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/**
 * The snapshot is generated, so nobody reads it before it ships. These pin
 * the shape the page, the OG image, and the homepage card depend on, so a
 * Notion restructure fails the code gate instead of publishing a hollow page.
 * The 2026-09 TL;DR rework emptied the hero silently before this existed.
 */
describe("manual.json snapshot", () => {
  it("carries the Notion-authored hero", () => {
    expect(data.hero.lead.length).toBeGreaterThan(0);
    expect(data.hero.panels.map((p) => p.id)).toContain("tl-dr");
    for (const panel of data.hero.panels) {
      expect(panel.blocks.length, panel.title).toBeGreaterThan(0);
    }
  });

  it("keeps the five sections the site styles by id", () => {
    // sectionIcons.tsx and manual-og-image.tsx key on these ids. A new or
    // renamed section is a deliberate change to both, not a sync.
    expect(data.sections.map((s) => s.id)).toEqual([
      "personality-strengths-blind-spots",
      "how-we-collaborate",
      "communication",
      "feedback",
      "hobbies",
    ]);
  });

  it("points every TL;DR hook at an on-page section", () => {
    const tldr = data.hero.panels.find((p) => p.id === "tl-dr");
    const list = tldr?.blocks.find((b) => b.type === "bulleted_list");
    expect(list?.type).toBe("bulleted_list");
    if (list?.type !== "bulleted_list") return;

    const anchors = new Set(data.sections.map((s) => `#${s.id}`));
    for (const item of list.items) {
      const links = [...JSON.stringify(item).matchAll(/"link":"([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(links.length, JSON.stringify(item)).toBe(1);
      expect(anchors.has(links[0]!), links[0]).toBe(true);
    }
  });

  it("sends no visitor to a private Notion page", () => {
    expect(text).not.toMatch(/https:\/\/(www\.notion\.so|app\.notion\.com)\//);
  });

  it("resolved every workspace emoji to a downloaded file", () => {
    for (const [run] of text.matchAll(/"customEmoji":\{[^}]*\}/g)) {
      expect(run).toMatch(/"src":"\/images\/notion-emoji\/[^"]+"/);
    }
  });

  it("matches the section list the homepage card repeats by hand", () => {
    const card = read("src/app/components/PersonalManual.tsx");
    for (const section of data.sections) {
      expect(card, section.title).toContain(`"${section.title}"`);
    }
  });
});
