"use client";

import type { PersonalityData } from "../types";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

import TiltCard from "~/app/components/TiltCard";

const domainColors: Record<
  string,
  { bg: string; border: string; text: string; badge: string }
> = {
  Executing: {
    bg: "bg-purple-50/60 dark:bg-purple-950/20",
    border: "border-purple-300/40 dark:border-purple-500/20",
    text: "text-purple-700 dark:text-purple-300",
    badge:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  },
  Influencing: {
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    border: "border-amber-300/40 dark:border-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  "Strategic Thinking": {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-300/40 dark:border-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  "Relationship Building": {
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
    border: "border-blue-300/40 dark:border-blue-500/20",
    text: "text-blue-700 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
};

const defaultColors = domainColors.Executing!;

export default function StrengthCards({
  strengths,
}: {
  strengths: PersonalityData["cliftonStrengths"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  // Group by domain
  const domains = new Map<string, PersonalityData["cliftonStrengths"]>();
  for (const s of strengths) {
    const existing = domains.get(s.domain) ?? [];
    existing.push(s);
    domains.set(s.domain, existing);
  }

  return (
    <div ref={ref} className="space-y-4">
      <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        CliftonStrengths Top 10
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from(domains.entries()).map(([domain, items], domainIdx) => {
          const colors = domainColors[domain] ?? defaultColors;
          return (
            <motion.div
              key={domain}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: domainIdx * 0.1, duration: 0.5 }}
            >
              <TiltCard tiltAmplitude={5} hoverScale={1.02}>
                <div
                  className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}
                >
                  <h4
                    className={`mb-3 text-xs font-semibold uppercase tracking-wider ${colors.text}`}
                  >
                    {domain}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((s) => (
                      <span
                        key={s.rank}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${colors.badge}`}
                        aria-label={`${s.name}, rank ${s.rank}. ${s.description}`}
                      >
                        <span className="opacity-50">#{s.rank}</span>
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
