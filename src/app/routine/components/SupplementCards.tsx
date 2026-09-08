"use client";

import type { Supplement } from "../types";
import { MoonStarsIcon, SunIcon } from "@phosphor-icons/react";
import Link from "next/link";

import DaylightSection from "~/components/daylight/DaylightSection";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup, NotionBlock } from "~/components/notion/types";

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
  // Filter out table blocks from context (already rendered as cards)
  const explanatoryBlocks = (contextBlocks ?? []).filter(
    (b) => b.type !== "table",
  );

  return (
    <DaylightSection id="supp-stacks" title="Supp Stacks">
      <div className="space-y-6 pb-4 pt-5">
        {/* Explanatory content from the rant */}
        {explanatoryBlocks.length > 0 && (
          <div className="dl-prose">
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
    </DaylightSection>
  );
}
