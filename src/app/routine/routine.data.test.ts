import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import rawData from "~~/data/routine.json";

import type { RoutineData } from "./types";

const data = rawData as unknown as RoutineData;
const text = JSON.stringify(data);
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const entries = [...data.timeline.am, ...data.timeline.pm];
const entry = (title: string) => entries.find((e) => e.title === title);

/**
 * The snapshot is generated, so nobody reads it before it ships. These pin
 * the shape the page, the OG image, and the homepage card depend on, so a
 * Notion restructure fails the code gate instead of publishing a hollow page.
 */
describe("routine.json snapshot", () => {
  it("carries the Notion-authored intro and timeline", () => {
    expect(data.intro.length).toBeGreaterThan(0);
    expect(data.timeline.am.length).toBeGreaterThanOrEqual(6);
    expect(data.timeline.pm.length).toBeGreaterThanOrEqual(3);
    for (const e of entries) {
      expect(e.time, e.title).toMatch(/^\d{1,2}:\d{2}(am|pm)$/);
    }
    expect(
      data.supplements.am.length + data.supplements.pm.length,
    ).toBeGreaterThanOrEqual(10);
  });

  it("keeps the rants page.tsx and routine-og.ts label by id", () => {
    expect(data.rants.map((r) => r.id)).toEqual([
      "sinusoidal-vs-square-wave-alertness",
      "caffeine",
      "supp-stacks",
      "sleep-duration",
      "getting-back-on-track",
    ]);
  });

  it("sends no visitor to a private Notion page", () => {
    expect(text).not.toMatch(/https:\/\/(www\.notion\.so|app\.notion\.com)\//);
  });

  it("resolved every workspace emoji to a downloaded file", () => {
    for (const [run] of text.matchAll(/"customEmoji":\{[^}]*\}/g)) {
      expect(run).toMatch(/"src":"\/images\/notion-emoji\/[^"]+"/);
    }
  });
});

/**
 * Two places restate schedule times instead of reading the snapshot: the
 * homepage card and the static OG image. Both drifted for a whole edit cycle
 * (6:00am lift on the site, 6:15am in Notion) before this test existed.
 */
describe("routine facts the site repeats by hand", () => {
  it("homepage card markers match the synced timeline", () => {
    const card = read("src/app/components/DailyRoutine.tsx");
    const markers = [
      ["Wake", "Wake Up"],
      ["Lift", "Lift"],
      ["Work", "Work"],
      ["Sleep", "Sleep"],
    ] as const;
    for (const [label, title] of markers) {
      const time = entry(title)?.time;
      expect(time, title).toBeDefined();
      expect(card, label).toContain(`{ time: "${time}", label: "${label}"`);
    }
  });

  it("routine OG beats match the synced timeline", () => {
    const og = read("scripts/generate/routine-og.ts");
    expect(og).toContain(`"${entry("Wake Up")?.time} wake"`);
    expect(og).toContain(`"${entry("Lift")?.time} lift"`);
    expect(og).toContain(`"${entry("Sleep")?.time} sleep"`);
  });
});
