import { GearIcon } from "@phosphor-icons/react/dist/ssr";

import manualJson from "~~/data/manual.json";
import routineJson from "~~/data/routine.json";
import systemsJson from "~~/data/systems.json";

import type { ManualData } from "~/app/manual/types";
import type { RoutineData } from "~/app/routine/types";
import type { SystemsData } from "~/app/systems/types";

import DailyRoutine, { type RoutineMarker } from "./DailyRoutine";
import DocSkylineDefs from "./DocSkyline";
import PersonalManual from "./PersonalManual";
import SystemsOverview, { type SystemsLayerRow } from "./SystemsOverview";

const manual = manualJson as unknown as ManualData;
const routine = routineJson as unknown as RoutineData;
const systems = systemsJson as unknown as SystemsData;

/** "September 2026", formatted here so the client cannot disagree by time zone. */
function monthOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The At a Glance line for each layer: the words after "Foundations:" and
 * before the "Read more" hook, as the owner wrote them, first letter up.
 */
function glanceBlurbs(): Map<string, string> {
  const blurbs = new Map<string, string>();
  const glance = systems.sections.find((s) => s.id === "at-a-glance");
  const list = glance?.blocks?.find((b) => b.type === "numbered_list");
  if (list?.type !== "numbered_list") return blurbs;
  for (const item of list.items) {
    const first = item[0];
    if (first?.type !== "paragraph") continue;
    const hook = first.content.find((run) => run.link?.startsWith("#"));
    const id = hook?.link?.slice(1);
    if (!id) continue;
    const words = first.content
      .slice(1)
      .filter((run) => !run.link)
      .map((run) => run.text)
      .join("")
      .trim();
    if (words) blurbs.set(id, words[0]!.toUpperCase() + words.slice(1));
  }
  return blurbs;
}

const blurbs = glanceBlurbs();
const layers: SystemsLayerRow[] = (
  systems.sections.find((s) => s.layers)?.layers ?? []
).map((layer) => ({
  id: layer.id,
  number: layer.number,
  title: layer.title,
  icon: layer.icon,
  blurb: blurbs.get(layer.id) ?? "",
}));

const entries = [...routine.timeline.am, ...routine.timeline.pm];
const markers: RoutineMarker[] = (
  [
    ["Wake Up", "Wake"],
    ["Lift", "Lift"],
    ["Work", "Work"],
    ["Sleep", "Sleep"],
  ] as const
).flatMap(([title, label]) => {
  const entry = entries.find((e) => e.title === title);
  return entry ? [{ time: entry.time, label, isAM: /am$/i.test(entry.time) }] : [];
});

/**
 * The three Notion documents as cards, each read straight from its synced
 * snapshot (titles, layers, timeline beats, last-updated month) so the cards
 * cannot drift from the pages. The skyline symbols render once here for the
 * three covers.
 */
export default function PersonalSystems() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <GearIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Personal Systems
      </h1>

      <DocSkylineDefs />
      <div className="flex w-full flex-col gap-4">
        <PersonalManual
          updated={monthOf(manual.lastUpdated)}
          sections={manual.sections.map(({ id, title, icon }) => ({
            id,
            title,
            icon,
          }))}
        />
        <SystemsOverview updated={monthOf(systems.lastUpdated)} layers={layers} />
        <DailyRoutine updated={monthOf(routine.lastUpdated)} markers={markers} />
      </div>
    </section>
  );
}
