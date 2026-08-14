import styles from "../routine.module.css";
import type { TimelineEntry } from "../types";
import { ArrowLeftIcon, SunHorizonIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import RoutineVignette from "./RoutineVignette";

export default function RoutineHero({
  intro,
  lastUpdated,
  entries,
}: {
  intro: string;
  lastUpdated: string;
  entries: readonly TimelineEntry[];
}) {
  return (
    <div className={styles.hero} data-routine-hero>
      <div className={`${styles.heroCopy} space-y-3`}>
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

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link
            href="https://www.chappyasel.com"
            className="flex items-center gap-1.5 transition-colors hover:text-muted-foreground"
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

      <div className={styles.vignetteDock}>
        <div className={styles.vignetteScale}>
          <RoutineVignette entries={entries} />
        </div>
      </div>
    </div>
  );
}
