import {
  ArrowLeftIcon,
  SunHorizonIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ThemeToggle } from "~/components/ui/theme-toggle";

export default function RoutineHero({
  intro,
  lastUpdated,
}: {
  intro: string;
  lastUpdated: string;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <SunHorizonIcon
            size={28}
            weight="duotone"
            className="text-foreground"
          />
          <h1 className="flex-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            <span className="sm:hidden">Daily Routine</span>
            <span className="hidden sm:inline">
              Chappy&apos;s Core Daily Routine
            </span>
          </h1>
          <ThemeToggle />
        </div>
        <p className="text-sm text-muted-foreground">{intro}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
          <Link
            href="https://www.chappyasel.com"
            className="flex items-center gap-1.5 transition-colors hover:text-muted-foreground"
          >
            <ArrowLeftIcon size={12} weight="bold" />
            chappyasel.com
          </Link>
          <span>·</span>
          <span>
            Last updated{" "}
            {new Date(lastUpdated).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
