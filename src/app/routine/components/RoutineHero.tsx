import { SunHorizonIcon } from "@phosphor-icons/react/dist/ssr";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";
import { ThemeToggle } from "~/components/ui/theme-toggle";

export default function RoutineHero({
  intro,
  lastUpdated,
}: {
  intro: string;
  lastUpdated: string;
}) {
  return (
    <SkyHero>
      <div className="space-y-3">
        {/* The toggle keeps the corner it has always had; the wayfinding line
            that used to share this row now sits under the description. */}
        <div className="flex justify-end">
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-3">
          <SunHorizonIcon
            size={28}
            weight="duotone"
            className="shrink-0 text-[hsl(var(--dl-sky-ink))]"
          />
          <h1 className="dl-hero-title">
            <span className="sm:hidden">Daily Routine</span>
            <span className="hidden sm:inline">
              Chappy&apos;s Core Daily Routine
            </span>
          </h1>
        </div>

        <p className="max-w-[34rem] text-[0.9375rem]">{intro}</p>

        <DaylightHeroMeta lastUpdated={lastUpdated} />
      </div>
    </SkyHero>
  );
}
