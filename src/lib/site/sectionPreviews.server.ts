import "server-only";
import manualJson from "~~/data/manual.json";
import routineJson from "~~/data/routine.json";
import systemsJson from "~~/data/systems.json";

import { anchorSlug } from "~/lib/anchors";

import type { NotionBlock, RichText } from "~/components/notion/types";

import { SITE_PAGES } from "./pages";
import type { SectionSharePage } from "./sectionShare";
import type { ManualData } from "~/app/manual/types";
import type { RoutineData } from "~/app/routine/types";
import type { SystemsData } from "~/app/systems/types";

export type SectionPreview = { id: string; title: string; description: string };

const plain = (runs: RichText[]) => runs.map((run) => run.text).join("");

function buildPreviews(page: SectionSharePage): Map<string, SectionPreview> {
  const previews = new Map<string, SectionPreview>();
  const add = (id: string, label: string, isToggle = false) => {
    const [name = "", ...explanation] = label.split(/\s+→\s*/u);
    let title = name
      .trim()
      .replace(
        /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*|[#*0-9]\uFE0F?\u20E3)\s*/u,
        "",
      );
    if (isToggle) title = title.replace(/\s*\([^)]*\)\s*$/, "");
    if (!title || previews.has(id)) return;
    previews.set(id, {
      id,
      title,
      description: explanation.join(" → ").trim() || SITE_PAGES[page].title,
    });
  };
  const visit = (blocks: NotionBlock[]) => {
    for (const block of blocks) {
      switch (block.type) {
        case "heading": {
          const label = plain(block.content);
          add(block.id ?? (anchorSlug(label) || "section"), label);
          break;
        }
        case "toggle":
          if (block.id) add(block.id, plain(block.title), true);
          visit(block.children);
          break;
        case "callout":
          visit(block.content);
          break;
        case "bulleted_list":
        case "numbered_list":
          block.items.forEach(visit);
          break;
      }
    }
  };

  if (page === "systems") {
    const data = systemsJson as unknown as SystemsData;
    visit(data.intro);
    for (const section of data.sections) {
      add(section.id, section.title);
      if (section.layers) {
        for (const layer of section.layers) {
          add(layer.id, layer.title);
          visit(layer.blocks);
        }
      } else visit(section.blocks);
    }
  } else if (page === "manual") {
    const data = manualJson as unknown as ManualData;
    visit(data.hero.lead);
    for (const section of [...data.hero.panels, ...data.sections]) {
      add(section.id, section.title);
      visit(section.blocks);
    }
  } else {
    const data = routineJson as unknown as RoutineData;
    if (data.whyEarly.length) add("why-early", "Why So Early?");
    add("morning", "Morning");
    add("evening", "Evening");
    add("supp-stacks", "Supp Stacks");
    visit(data.intro);
    visit(data.whyEarly);
    for (const entry of [...data.timeline.am, ...data.timeline.pm])
      visit(entry.blocks);
    for (const section of data.rants) {
      add(section.id, section.title);
      visit(section.blocks);
    }
  }
  return previews;
}

const previews = new Map<SectionSharePage, Map<string, SectionPreview>>();

export function getSectionPreview(
  page: SectionSharePage,
  id: string | string[] | undefined,
): SectionPreview | null {
  if (typeof id !== "string" || !id) return null;
  let entries = previews.get(page);
  if (!entries) {
    entries = buildPreviews(page);
    previews.set(page, entries);
  }
  return entries.get(id) ?? null;
}
