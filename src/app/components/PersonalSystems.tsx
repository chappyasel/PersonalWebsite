import { GearIcon } from "@phosphor-icons/react/dist/ssr";

import DailyRoutine from "./DailyRoutine";
import PersonalManual from "./PersonalManual";

export default function PersonalSystems() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <GearIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Systems
      </h1>

      <div className="flex w-full flex-col gap-4">
        <PersonalManual />
        <DailyRoutine />
      </div>
    </section>
  );
}
