"use client";

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

/**
 * The app's iteration picker (IterationSelectionViewController): a card with
 * a category-color header reading "Select a Variation", then one row per
 * variant — the default variant labeled "{name} (Default)", others with the
 * iteration word bold and the base name muted. Web version opens from a
 * button beside the title instead of a pencil in the nav bar.
 */
export function VariationPicker({
  variants,
  currentSlug,
  baseName,
  color,
}: {
  variants: { slug: string; displayName: string }[];
  currentSlug: string;
  baseName: string;
  color: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
        >
          Variation
          <CaretDownIcon
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            weight="bold"
          />
        </button>

        <AnimatePresence>
          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "top right" }}
                className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div
                  className="px-4 py-2.5 text-center text-sm font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  Select a Variation
                </div>
                <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-700/60">
                  {variants.map((variant) => {
                    const iteration = variant.displayName.endsWith(baseName)
                      ? variant.displayName
                          .slice(
                            0,
                            variant.displayName.length - baseName.length,
                          )
                          .trim()
                      : "";
                    const isCurrent = variant.slug === currentSlug;
                    return (
                      <li key={variant.slug}>
                        <Link
                          href={`/weightlifting/${variant.slug}`}
                          onClick={() => setOpen(false)}
                          className={`block px-4 py-2.5 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/60 ${
                            isCurrent
                              ? "bg-neutral-50 dark:bg-neutral-700/40"
                              : ""
                          }`}
                        >
                          {iteration ? (
                            <>
                              <span className="font-bold text-neutral-700 dark:text-neutral-200">
                                {iteration}
                              </span>{" "}
                              <span className="text-neutral-400 dark:text-neutral-500">
                                {baseName}
                              </span>
                            </>
                          ) : (
                            <span className="text-neutral-500 dark:text-neutral-400">
                              {baseName}{" "}
                              <span className="text-neutral-400 dark:text-neutral-500">
                                (Default)
                              </span>
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
