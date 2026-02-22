"use client";

import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import React, { useMemo, useState } from "react";

import { type Output } from "~/lib/liarsdice";
import { numberToString } from "~/lib/liarsdice/util";

import DiceFace from "./DiceFace";

export interface Props {
  output: Output;
}

function probColor(p: number): React.CSSProperties {
  const hue = p * 120;
  return {
    backgroundColor: `hsl(${hue} 70% var(--prob-bg-lightness))`,
    color: `hsl(${hue} 50% var(--prob-text-lightness))`,
  };
}

export default function OutputTable({ output }: Props) {
  const defaultExpanded = useMemo(() => {
    const set = new Set<number>();
    for (const t of output.targets) {
      if (t.alreadyHave > 0) set.add(t.diceNumber);
    }
    if (set.size === 0) {
      for (const t of output.targets) set.add(t.diceNumber);
    }
    return set;
  }, [output.targets]);

  const [expanded, setExpanded] = useState<Set<number>>(defaultExpanded);

  React.useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const toggleExpanded = (diceNumber: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(diceNumber)) next.delete(diceNumber);
      else next.add(diceNumber);
      return next;
    });
  };

  const bestBid = output.bestBid;

  return (
    <div className="flex w-full flex-col gap-3">
      {bestBid && (
        <div className="rounded-lg border bg-card p-3 text-center">
          <span className="text-sm text-muted-foreground">Best bid: </span>
          <span className="font-semibold">
            {bestBid.quantity}{" "}
            {numberToString(bestBid.faceValue - 1).toLowerCase()}
          </span>
          <span className="text-sm text-muted-foreground">
            {" "}
            ({(bestBid.probability * 100).toFixed(0)}%)
          </span>
        </div>
      )}

      {output.targets.map((target) => {
        const isExpanded = expanded.has(target.diceNumber);
        const best = target.scenarios.find((s) => s.probability >= 0.5);
        const bestSummary = best
          ? `best: ${best.numMatches} at ${(best.probability * 100).toFixed(0)}%`
          : "";

        return (
          <div key={target.diceNumber} className="w-full">
            <button
              onClick={() => toggleExpanded(target.diceNumber)}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-muted/50"
            >
              {isExpanded ? (
                <CaretDownIcon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  weight="bold"
                />
              ) : (
                <CaretRightIcon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  weight="bold"
                />
              )}
              <DiceFace
                value={target.diceNumber}
                className="h-6 w-6 shrink-0 text-foreground"
              />
              <span className="font-semibold">
                {numberToString(target.diceNumber - 1)}
              </span>
              <span className="text-sm text-muted-foreground">
                (have {target.alreadyHave})
              </span>
              {bestSummary && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {bestSummary}
                </span>
              )}
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && target.scenarios.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <table className="mt-1 w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="rounded-tl-md border border-border p-1.5 text-left font-medium">
                          #
                        </th>
                        <th className="border border-border p-1.5 text-left font-medium">
                          Probability
                        </th>
                        <th className="rounded-tr-md border border-border p-1.5 text-left font-medium">
                          Spot On
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {target.scenarios.map((scenario, index) => {
                        const pct = (scenario.probability * 100).toFixed(1);
                        const spotOn = (
                          scenario.spotOnProbability * 100
                        ).toFixed(1);
                        return (
                          <tr key={index}>
                            <td className="border border-border p-1.5 font-medium">
                              {scenario.numMatches}
                            </td>
                            <td
                              className="border border-border p-1.5 font-medium tabular-nums"
                              style={probColor(scenario.probability)}
                            >
                              {pct}%
                            </td>
                            <td
                              className="border border-border p-1.5 tabular-nums"
                              style={probColor(scenario.spotOnProbability)}
                            >
                              {spotOn}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {isExpanded && target.scenarios.length === 0 && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden px-2 py-1 text-sm text-muted-foreground"
                >
                  No significant probabilities
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
