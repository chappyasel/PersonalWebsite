"use client";

import Link from "next/link";
import { useState } from "react";

import { MoonStarsIcon, SunIcon } from "@phosphor-icons/react";

import AnchorLink from "~/components/daylight/AnchorLink";
import { SectionIcon } from "~/components/daylight/sectionIcons";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup, NotionBlock } from "~/components/notion/types";
import { DisclosureCaret } from "~/components/ui/disclosure";

import type { Supplement } from "../types";
import { releaseHash, useHashTarget } from "./sectionLink";

function SupplementCard({
  supplement,
  arc,
}: {
  supplement: Supplement;
  arc: "am" | "pm";
}) {
  const doseColor =
    arc === "am" ? "text-[hsl(var(--dl-am))]" : "text-[hsl(var(--dl-pm))]";

  const content = (
    <div className="flex h-full flex-col gap-1 rounded-[0.625rem] border border-border px-3.5 py-3 transition-colors group-hover:bg-secondary/70">
      <h4 className="font-sans text-sm font-semibold text-foreground">
        {supplement.name}
      </h4>
      <div className="flex flex-wrap gap-x-2.5 font-mono text-[0.6875rem] tabular-nums">
        {supplement.dosage && (
          <span className={`font-semibold ${doseColor}`}>
            {supplement.dosage}
          </span>
        )}
        {supplement.costPerDay && (
          <span className="text-muted-foreground/70">
            {supplement.costPerDay}/day
          </span>
        )}
      </div>
      {supplement.benefits && (
        <span className="font-sans text-xs text-muted-foreground/85">
          {supplement.benefits}
        </span>
      )}
    </div>
  );

  if (supplement.link) {
    return (
      <Link
        href={supplement.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group block h-full"
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
  arc,
}: {
  label: string;
  icon: React.ReactNode;
  supplements: Supplement[];
  arc: "am" | "pm";
}) {
  if (supplements.length === 0) return null;

  const totalCost = supplements.reduce((sum, s) => {
    const match = /[\d.]+/.exec(s.costPerDay);
    return sum + (match ? parseFloat(match[0]) : 0);
  }, 0);

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        {icon}
        <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </h3>
        <span className="ml-auto font-mono text-[0.6875rem] tabular-nums text-muted-foreground/80">
          ${totalCost.toFixed(2)}/day total
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {supplements.map((supp, i) => (
          <SupplementCard key={i} supplement={supp} arc={arc} />
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
        className="group/sec flex w-full cursor-pointer items-center gap-2.5 border-b border-border/80 pb-2 text-left"
      >
        <SectionIcon id="supp-stacks" size={18} className="shrink-0" />
        <h2 className="dl-h2">Supp Stacks</h2>
        <AnchorLink id="supp-stacks" />
        <DisclosureCaret
          data-routine-caret
          open={open}
          className="ml-auto text-muted-foreground/40"
        />
      </div>
      <div
        data-routine-collapse
        data-open={open}
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] data-[open=true]:grid-rows-[1fr]"
      >
        <div className="overflow-hidden">
          <div className="space-y-6 pb-4 pt-3.5">
            {/* Explanatory content from the rant */}
            {explanatoryBlocks.length > 0 && (
              <div className="space-y-3 text-[0.9375rem] text-muted-foreground">
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
                  <SunIcon
                    size={15}
                    weight="bold"
                    className="text-[hsl(var(--dl-am))]"
                  />
                }
                supplements={am}
                arc="am"
              />
              <SupplementSubSection
                label="Evening Stack"
                icon={
                  <MoonStarsIcon
                    size={15}
                    weight="bold"
                    className="text-[hsl(var(--dl-pm))]"
                  />
                }
                supplements={pm}
                arc="pm"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
