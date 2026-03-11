"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { CaretRightIcon } from "@phosphor-icons/react";

import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup, NotionBlock } from "~/components/notion/types";

export default function TimelineEntry({
  time,
  title,
  blocks,
  bookLookup,
  accentColor,
}: {
  time: string;
  title: string;
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
  accentColor: "amber" | "indigo";
}) {
  const [open, setOpen] = useState(false);

  const dotColor =
    accentColor === "amber"
      ? "bg-amber-400 dark:bg-amber-500"
      : "bg-indigo-400 dark:bg-indigo-500";

  const timeBadgeColor =
    accentColor === "amber"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot */}
      <div className="relative flex w-20 shrink-0 flex-col items-end pt-3">
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${timeBadgeColor}`}
        >
          {time}
        </span>
      </div>

      {/* Dot on the line */}
      <div className="relative flex flex-col items-center">
        <div
          className={`mt-3.5 h-3 w-3 shrink-0 rounded-full ${dotColor} ring-4 ring-background`}
        />
        {/* Connector line (handled by parent) */}
      </div>

      {/* Content card */}
      <div className="min-w-0 flex-1 pb-8">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
        >
          <CaretRightIcon
            size={14}
            weight="bold"
            className={`mt-1 shrink-0 text-muted-foreground/60 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span className="font-semibold text-foreground">{title}</span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-2 px-3 pb-2 pt-1 text-muted-foreground">
                {blocks.map((block, i) => (
                  <NotionBlockRenderer
                    key={i}
                    block={block}
                    bookLookup={bookLookup}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
