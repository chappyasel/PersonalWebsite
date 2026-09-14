import { GearIcon } from "@phosphor-icons/react/dist/ssr";
import manualJson from "~~/data/manual.json";
import routineJson from "~~/data/routine.json";
import systemsJson from "~~/data/systems.json";

import DailyRoutine, { type RoutineMarker } from "./DailyRoutine";
import DocSkylineDefs from "./DocSkyline";
import PersonalManual from "./PersonalManual";
import SystemsOverview, { type SystemsLayerRow } from "./SystemsOverview";
import type { ManualData } from "~/app/manual/types";
import type { RoutineData } from "~/app/routine/types";
import type { SystemsData } from "~/app/systems/types";

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

const layers: SystemsLayerRow[] = (
  systems.sections.find((s) => s.layers)?.layers ?? []
).map((layer) => ({
  id: layer.id,
  number: layer.number,
  title: layer.title,
  icon: layer.icon,
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
  return entry
    ? [{ time: entry.time, label, isAM: /am$/i.test(entry.time) }]
    : [];
});

/**
 * The three Notion documents as cards, each read straight from its synced
 * snapshot (titles, layers, timeline beats, last-updated month) so the cards
 * cannot drift from the pages. The skyline symbols render once here for the
 * three covers.
 */
export default function PersonalSystems() {
  return (
    <section className="placard-card-stack flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <GearIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Personal Systems
      </h1>

      <DocSkylineDefs />
      <div className="placard-card-stack flex w-full flex-col gap-4">
        <PersonalManual
          updated={monthOf(manual.lastUpdated)}
          sections={manual.sections.map(({ id, title, icon }) => ({
            id,
            title,
            icon,
          }))}
        />
        <SystemsOverview
          updated={monthOf(systems.lastUpdated)}
          layers={layers}
        />
        <DailyRoutine
          updated={monthOf(routine.lastUpdated)}
          markers={markers}
        />
      </div>
    </section>
  );
}
