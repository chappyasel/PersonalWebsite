"use client";

import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { useRef, useState } from "react";

import {
  CaretRightIcon,
  MoonStarsIcon,
  SunIcon,
} from "@phosphor-icons/react";

import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup, NotionBlock } from "~/components/notion/types";

import type { Supplement } from "../types";
import { AnchorLink, releaseHash, useHashTarget } from "./sectionLink";

function SupplementCard({
  supplement,
  index,
  isInView,
  accentColor,
}: {
  supplement: Supplement;
  index: number;
  isInView: boolean;
  accentColor: "amber" | "indigo";
}) {
  const borderColor =
    accentColor === "amber"
      ? "border-amber-200 dark:border-amber-800/50"
      : "border-indigo-200 dark:border-indigo-800/50";

  const badgeColor =
    accentColor === "amber"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`rounded-xl border ${borderColor} bg-background/60 p-4 shadow-sm transition-colors hover:bg-muted/40`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          {supplement.name}
        </h4>
        {supplement.costPerDay && (
          <span className="shrink-0 text-xs text-muted-foreground/60">
            {supplement.costPerDay}/day
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {supplement.dosage && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}
          >
            {supplement.dosage}
          </span>
        )}
        {supplement.benefits && (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
            {supplement.benefits}
          </span>
        )}
      </div>
    </motion.div>
  );

  if (supplement.link) {
    return (
      <Link
        href={supplement.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {content}
      </Link>
    );
  }

  return content;
}

function SupplementSubSection({
  label,
  icon,
  supplements,
  accentColor,
}: {
  label: string;
  icon: React.ReactNode;
  supplements: Supplement[];
  accentColor: "amber" | "indigo";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  if (supplements.length === 0) return null;

  const totalCost = supplements.reduce((sum, s) => {
    const match = /[\d.]+/.exec(s.costPerDay);
    return sum + (match ? parseFloat(match[0]) : 0);
  }, 0);

  return (
    <div ref={ref}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
            {label}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground/50">
          ${totalCost.toFixed(2)}/day total
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {supplements.map((supp, i) => (
          <SupplementCard
            key={i}
            supplement={supp}
            index={i}
            isInView={isInView}
            accentColor={accentColor}
          />
        ))}
      </div>
    </div>
  );
}

export default function SupplementCardsSection({
  am,
  pm,
  contextBlocks,
  bookLookup,
}: {
  am: Supplement[];
  pm: Supplement[];
  contextBlocks?: NotionBlock[];
  bookLookup?: BookLookup;
}) {
  const [open, setOpen] = useState(false);
  useHashTarget("supp-stacks", setOpen);

  const toggle = () => {
    releaseHash(); // drop the deep-link target so :target stops forcing open
    setOpen((v) => !v);
  };

  // Filter out table blocks from context (already rendered as cards)
  const explanatoryBlocks = (contextBlocks ?? []).filter(
    (b) => b.type !== "table",
  );

  return (
    <section id="supp-stacks" className="routine-collapsible scroll-mt-24">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="group/sec flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="text-2xl">💊</span>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Supp Stacks
        </h2>
        <AnchorLink id="supp-stacks" />
        <CaretRightIcon
          data-routine-caret
          size={16}
          weight="bold"
          className={`ml-auto shrink-0 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </div>
      <div
        data-routine-collapse
        data-open={open}
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-in-out data-[open=true]:grid-rows-[1fr]"
      >
        <div className="overflow-hidden">
          <div className="space-y-6 px-4 pb-4 pt-2">
            {/* Explanatory content from the rant */}
            {explanatoryBlocks.length > 0 && (
              <div className="space-y-3 text-muted-foreground">
                {explanatoryBlocks.map((block, i) => (
                  <NotionBlockRenderer
                    key={i}
                    block={block}
                    bookLookup={bookLookup}
                  />
                ))}
              </div>
            )}

            {/* Supplement cards */}
            <div className="space-y-8">
              <SupplementSubSection
                label="Morning Stack"
                icon={
                  <SunIcon size={16} weight="bold" className="text-amber-500" />
                }
                supplements={am}
                accentColor="amber"
              />
              <SupplementSubSection
                label="Evening Stack"
                icon={
                  <MoonStarsIcon
                    size={16}
                    weight="bold"
                    className="text-indigo-400"
                  />
                }
                supplements={pm}
                accentColor="indigo"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
