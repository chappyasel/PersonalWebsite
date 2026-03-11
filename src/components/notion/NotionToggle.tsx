"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { CaretRightIcon } from "@phosphor-icons/react";

import type { BookLookup, NotionBlock, RichText } from "~/components/notion/types";
import NotionBlockRenderer from "./NotionBlockRenderer";
import RichTextRenderer from "./RichTextRenderer";

export default function NotionToggle({
  title,
  blocks,
  bookLookup,
}: {
  title: RichText[];
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 py-1 text-left transition-colors hover:text-foreground"
      >
        <CaretRightIcon
          size={16}
          weight="bold"
          className={`mt-1 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        <span className="font-medium">
          <RichTextRenderer content={title} bookLookup={bookLookup} />
        </span>
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
            <div className="space-y-2 pb-2 pl-6 pt-1">
              {blocks.map((block, i) => (
                <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
