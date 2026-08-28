"use client";

import { WlBackLink } from "../components/WlBackLink";
import { ordinalDate } from "../lib/wlaFormat";
import { VariationPicker } from "./VariationPicker";

/** The exercise page's nav-bar parity header: the title itself is the
 * variation trigger (label tap + pencil, like the app), with the category
 * dot and meta line beneath. */
export function ExerciseHeader({
  displayName,
  category,
  color,
  firstPerformed,
  lastPerformed,
  instanceCount,
  totalSets,
  variants,
  currentSlug,
  baseName,
}: {
  displayName: string;
  category: string;
  color: string;
  firstPerformed: string;
  lastPerformed: string;
  instanceCount: number;
  totalSets: number;
  variants: { slug: string; displayName: string }[];
  currentSlug: string;
  baseName: string;
}) {
  return (
    // In the sheet the corner cluster (expand + close) occupies the top
    // right; the header pads past it so a long title stays clear.
    <div className="flex flex-col gap-3 [[data-modal-sheet]_&]:pr-24">
      {/* Redundant inside the sheet — the sheet's own X already goes back
          to the dashboard — so it hides itself there. */}
      <WlBackLink className="[[data-modal-sheet]_&]:hidden" />
      {variants.length > 1 ? (
        <VariationPicker
          title={displayName}
          variants={variants}
          currentSlug={currentSlug}
          baseName={baseName}
          color={color}
        />
      ) : (
        <h1 className="font-rounded text-2xl font-semibold text-foreground md:text-4xl">
          {displayName}
        </h1>
      )}
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        <span
          className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-[-1px]"
          style={{ backgroundColor: color }}
        />
        {category} · {ordinalDate(firstPerformed)} –{" "}
        {ordinalDate(lastPerformed)} · {instanceCount.toLocaleString()}{" "}
        instances · {totalSets.toLocaleString()} sets
      </p>
    </div>
  );
}
