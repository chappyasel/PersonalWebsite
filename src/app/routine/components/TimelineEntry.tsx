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
}: {
  time: string;
  title: string;
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="dl-entry-head"
      >
        <span className="dl-entry-time font-mono">{time}</span>
        <span className="dl-entry-dot" />
        <CaretRightIcon
          size={13}
          weight="bold"
          className={`justify-self-center text-muted-foreground/50 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        <span className="dl-entry-title">{title}</span>
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
            <div className="dl-entry-body space-y-2 text-muted-foreground">
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
  );
}
