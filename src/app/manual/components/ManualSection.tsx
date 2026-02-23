"use client";

import { CheckCircleIcon, LinkIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import type { BookLookup, ManualSection as ManualSectionType } from "../types";
import ManualBlockRenderer from "./ManualBlockRenderer";

export default function ManualSection({
  section,
  bookLookup,
}: {
  section: ManualSectionType;
  bookLookup?: BookLookup;
}) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${section.id}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section id={section.id} className="scroll-mt-24">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={copyLink}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="text-2xl">{section.icon}</span>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {section.title}
        </h2>
        <div className="relative h-4 w-4">
          <motion.div
            className="absolute inset-0"
            animate={{ opacity: !copied && hovered ? 0.4 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <LinkIcon size={16} weight="bold" />
          </motion.div>
          <AnimatePresence>
            {copied && (
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.2 }}
              >
                <CheckCircleIcon size={16} weight="fill" className="text-emerald-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="space-y-3 px-4 pt-2 text-muted-foreground">
        {section.blocks.map((block, i) => (
          <ManualBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
      </div>
    </section>
  );
}
