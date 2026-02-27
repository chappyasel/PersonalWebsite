"use client";

import { HouseLineIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { StatsCards } from "./components/StatsCards";
import { YearCalendar } from "./components/YearCalendar";
import { StrengthProgressionChart } from "./components/StrengthProgressionChart";
import { PersonalRecords } from "./components/PersonalRecords";
import { devBaseUrl } from "~/lib/util";

export default function WeightliftingPage() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
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
      </div>

      {/* Stats */}
      <section>
        <StatsCards />
      </section>

      {/* Year Calendar */}
      <section>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <YearCalendar />
        </div>
      </section>

      {/* Strength Progression */}
      <section>
        <h2 className="mb-4 font-rounded text-lg font-medium text-neutral-700 dark:text-neutral-200">
          Strength Progression
        </h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <StrengthProgressionChart />
        </div>
      </section>

      {/* Personal Records */}
      <section>
        <h2 className="mb-4 font-rounded text-lg font-medium text-neutral-700 dark:text-neutral-200">
          All-time PRs
        </h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <PersonalRecords />
        </div>
      </section>
    </div>
  );
}
