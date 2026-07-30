"use client";

import {
  CalendarDotsIcon,
  CaretDownIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  HouseLineIcon,
  ListBulletsIcon,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { StatsCards } from "./StatsCards";
import { WatchTimeChart } from "./WatchTimeChart";
import { TopChannels } from "./TopChannels";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { YearCalendar } from "./YearCalendar";
import { devBaseUrl } from "~/lib/util";

function CollapsibleSection({
  icon,
  title,
  defaultOpen = true,
  lazy = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  lazy?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasOpened, setHasOpened] = useState(defaultOpen);

  const handleToggle = () => {
    if (!isOpen && !hasOpened) setHasOpened(true);
    setIsOpen(!isOpen);
  };

  return (
    <section>
      <button
        onClick={handleToggle}
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
              {!lazy || hasOpened ? children : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function YouTubeDashboard() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
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
                  key="yt-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <YoutubeLogo
                    className="h-7 w-7 text-red-600 md:h-9 md:w-9"
                    weight="fill"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </span>
          <span className="line-clamp-1 font-rounded">
            Chappy&apos;s YouTube
          </span>
        </Link>
      </div>

      {/* Stats */}
      <section>
        <StatsCards />
      </section>

      {/* Watch Time Over Time */}
      <CollapsibleSection
        icon={<ChartLineUpIcon className="h-5 w-5" weight="bold" />}
        title="Watch Time"
      >
        <WatchTimeChart />
      </CollapsibleSection>

      {/* Top Channels */}
      <CollapsibleSection
        icon={<ListBulletsIcon className="h-5 w-5" weight="bold" />}
        title="Top Channels"
      >
        <TopChannels />
      </CollapsibleSection>

      {/* Category Breakdown */}
      <CollapsibleSection
        icon={<ChartBarIcon className="h-5 w-5" weight="bold" />}
        title="Category Breakdown"
      >
        <CategoryBreakdown />
      </CollapsibleSection>

      {/* Calendar Heatmap */}
      <CollapsibleSection
        icon={<CalendarDotsIcon className="h-5 w-5" weight="bold" />}
        title="Daily Activity"
        defaultOpen={false}
        lazy
      >
        <YearCalendar />
      </CollapsibleSection>
    </div>
  );
}
