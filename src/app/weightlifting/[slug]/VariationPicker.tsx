"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Link from "next/link";
import { useContext, useState } from "react";

import { InModalSheetContext } from "~/components/modal-sheet/ModalSheet";

import { useWlPath } from "../lib/paths";

/**
 * The app's iteration picker (IterationSelectionViewController): a card with
 * a category-color header reading "Select a Variation", then one row per
 * variant — the default variant labeled "{name} (Default)", others with the
 * iteration word bold and the base name muted. Like the app's nav bar (title
 * label tap + pencil button), the whole page title is the trigger here, with
 * a pencil beside it as the affordance.
 */
export function VariationPicker({
  title,
  variants,
  currentSlug,
  baseName,
  color,
}: {
  title: string;
  variants: { slug: string; displayName: string }[];
  currentSlug: string;
  baseName: string;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  // In the intercepted sheet a soft nav swaps the exercise inside the same
  // sheet; on the full page a soft nav would be INTERCEPTED into a sheet
  // over this full page, so it hard-navigates instead.
  const inSheet = useContext(InModalSheetContext);
  const wlPath = useWlPath();

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative">
        <h1 className="font-rounded text-2xl font-semibold text-foreground md:text-4xl">
          {/* The pencil brightening toward the text color is the whole hover
              affordance — dimming the title too moved the two in opposite
              directions in dark mode. */}
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="group inline-flex items-center gap-2.5 text-left"
          >
            {title}
            <PencilSimpleIcon
              className="h-5 w-5 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300 md:h-6 md:w-6"
              weight="bold"
            />
          </button>
        </h1>

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
                style={{ transformOrigin: "top left" }}
                className="absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
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
                    const Nav = inSheet ? Link : "a";
                    return (
                      <li key={variant.slug}>
                        <Nav
                          href={wlPath(`/${variant.slug}`)}
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
                        </Nav>
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
