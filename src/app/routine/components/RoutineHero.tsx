import { ArrowLeftIcon, SunHorizonIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

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
        <div className="flex items-center gap-3">
          <SunHorizonIcon
            size={28}
            weight="duotone"
            className="text-[hsl(var(--dl-sky-ink))]"
          />
          <h1 className="dl-hero-title flex-1">
            <span className="sm:hidden">Daily Routine</span>
            <span className="hidden sm:inline">
              Chappy&apos;s Core Daily Routine
            </span>
          </h1>
          <ThemeToggle />
        </div>

        <p className="max-w-[34rem] text-[0.9375rem]">{intro}</p>

        <div className="flex items-center gap-3 font-sans text-xs text-[hsl(var(--dl-sky-ink)/0.8)]">
          <Link
            href="https://www.chappyasel.com"
            className="flex items-center gap-1.5 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
          >
            <ArrowLeftIcon size={12} weight="bold" />
            chappyasel.com
          </Link>
          <span aria-hidden>·</span>
          <span>
            Last updated{" "}
            {new Date(lastUpdated).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </SkyHero>
  );
}
