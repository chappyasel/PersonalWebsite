"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { CaretRightIcon } from "@phosphor-icons/react";

import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";

import type { RoutineSection as RoutineSectionType } from "../types";

export default function RoutineSection({
  section,
  bookLookup,
  defaultOpen = false,
}: {
  section: RoutineSectionType;
  bookLookup?: BookLookup;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={section.id} className="scroll-mt-24">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="text-2xl">{section.icon}</span>
        <h2 className="flex-1 text-xl font-semibold tracking-tight text-foreground">
          {section.title}
        </h2>
        <CaretRightIcon
          size={16}
          weight="bold"
          className={`shrink-0 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4 pt-2 text-muted-foreground">
              {section.blocks.map((block, i) => (
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
    </section>
  );
}
