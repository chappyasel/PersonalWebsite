"use client";

import { wlSearchParams } from "../lib/searchParams";
import {
  CalendarDotsIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  HouseLineIcon,
  TrophyIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useState } from "react";

import { devBaseUrl } from "~/lib/util";

import { CollapsibleSection } from "~/components/ui/collapsible-section";

import { PersonalRecords } from "./PersonalRecords";
import { StrengthProgressionChart } from "./StrengthProgressionChart";
import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { TrainingOverYears } from "./TrainingOverYears";
import { YearCalendar } from "./YearCalendar";

export function WeightliftingDashboard() {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedExercises, setSelectedExercises] = useQueryState(
    "exercises",
    wlSearchParams.exercises,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 font-sans sm:space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={
              process.env.NODE_ENV === "production"
                ? "https://www.chappyasel.com"
                : devBaseUrl()
            }
            className="group inline-flex items-center gap-2 text-2xl font-semibold text-foreground transition-opacity hover:opacity-80 md:text-4xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <span className="relative inline-flex h-7 w-7 items-center justify-center md:h-9 md:w-9">
              <AnimatePresence mode="wait" initial={false}>
                {isHovered ? (
                  <motion.div
                    key="house-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <HouseLineIcon
                      className="h-7 w-7 md:h-9 md:w-9"
                      weight="bold"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="app-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Image
                      src="/images/notion-emoji/weightlifting-app.png"
                      alt="Weightlifting App"
                      width={36}
                      height={36}
                      className="h-7 w-7 rounded-lg md:h-9 md:w-9"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </span>
            <span className="line-clamp-1 font-rounded">
              Chappy&apos;s Weightlifting
            </span>
          </Link>
          {/* Align with the title text (icon width + gap) */}
          <div className="pl-9 md:pl-11">
            <SyncStatusIndicator />
          </div>
        </div>
      </div>

      {/* Story */}
      <p className="-mt-4 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
        Every workout and every set since 2017 &ndash; all logged in{" "}
        <a
          href="https://apps.apple.com/us/app/id1266077653"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-700 dark:decoration-neutral-600 dark:hover:text-neutral-200"
        >
          an app I originally built in high school
        </a>
        ! I&apos;m a competitive natural bodybuilder and nerding out over the
        data is half the fun: everything on this page comes straight from that
        log and learnings over the years!
      </p>

      {/* Training history */}
      <CollapsibleSection
        icon={<ChartBarIcon className="h-5 w-5" weight="bold" />}
        title="Training History"
      >
        <TrainingOverYears />
      </CollapsibleSection>

      {/* Featured Lifts PRs */}
      <CollapsibleSection
        icon={<TrophyIcon className="h-5 w-5" weight="bold" />}
        title="Featured Lifts"
      >
        <PersonalRecords selectedExercises={selectedExercises} />
      </CollapsibleSection>

      {/* Strength Progression */}
      <CollapsibleSection
        icon={<ChartLineUpIcon className="h-5 w-5" weight="bold" />}
        title="Strength Progression"
      >
        <StrengthProgressionChart
          selectedExercises={selectedExercises}
          setSelectedExercises={setSelectedExercises}
        />
      </CollapsibleSection>

      {/* All Workouts Calendar */}
      <CollapsibleSection
        icon={<CalendarDotsIcon className="h-5 w-5" weight="bold" />}
        title="All Workouts"
      >
        <YearCalendar />
      </CollapsibleSection>
    </div>
  );
}
