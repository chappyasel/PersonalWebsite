"use client";

import {
  CalendarDotsIcon,
  CaretDownIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  HouseLineIcon,
  TrophyIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { type ReactNode, useId, useState } from "react";

import { devBaseUrl } from "~/lib/util";
import { wlSearchParams } from "../lib/searchParams";
import { PersonalRecords } from "./PersonalRecords";
import { StatsCards } from "./StatsCards";
import { StrengthProgressionChart } from "./StrengthProgressionChart";
import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { TrainingStatsPopover } from "./TrainingStatsPopover";
import { YearCalendar } from "./YearCalendar";

function CollapsibleSection({
  icon,
  title,
  defaultOpen = true,
  children,
}: {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="mb-4 flex w-full items-center gap-2 font-rounded text-lg font-medium text-neutral-700 transition-opacity hover:opacity-80 dark:text-neutral-200"
      >
        {icon}
        <span>{title}</span>
        <CaretDownIcon
          className={`ml-auto h-4 w-4 text-neutral-400 transition-transform dark:text-neutral-500 ${isOpen ? "rotate-180" : ""}`}
          weight="bold"
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function WeightliftingDashboard() {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedExercises, setSelectedExercises] = useQueryState(
    "exercises",
    wlSearchParams.exercises,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
        <Link
          href={
            process.env.NODE_ENV === "production"
              ? "https://chappyasel.com"
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
                    src="/images/manual/weightlifting-app.png"
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
        <TrainingStatsPopover
          scope="all"
          align="end"
          triggerClassName="flex size-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
        >
          <ChartBarIcon className="size-4" weight="bold" />
        </TrainingStatsPopover>
      </div>

      {/* Stats */}
      <section>
        <StatsCards />
      </section>

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

      {/* Featured Lifts PRs */}
      <CollapsibleSection
        icon={<TrophyIcon className="h-5 w-5" weight="bold" />}
        title="Featured Lifts"
      >
        <PersonalRecords selectedExercises={selectedExercises} />
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
