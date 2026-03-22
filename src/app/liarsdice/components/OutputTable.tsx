"use client";

import { CaretDownIcon, CaretRightIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import React, { useMemo, useState } from "react";

import { type Output } from "~/lib/liarsdice";
import { numberToString } from "~/lib/liarsdice/util";

import DiceFace from "./DiceFace";

export interface Props {
  output: Output;
  currentBid?: number;
}

function probColor(p: number): React.CSSProperties {
  // Curve so yellow (hue 60) lands at ~30% probability
  const hue = p <= 0.3 ? (p / 0.3) * 60 : 60 + ((p - 0.3) / 0.7) * 60;
  return {
    backgroundColor: `hsl(${hue} 85% var(--prob-bg-lightness))`,
    color: `hsl(${hue} 70% var(--prob-text-lightness))`,
  };
}

export default function OutputTable({ output, currentBid }: Props) {
  const [showAll, setShowAll] = useState(false);
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
        <div className="flex items-center rounded-lg border bg-card p-3">
          <div className="flex-1 text-center">
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
          {currentBid !== undefined && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              aria-label={showAll ? "Hide bids at or below current bid" : "Show all bids"}
            >
              {showAll ? (
                <EyeIcon className="h-4 w-4" weight="bold" />
              ) : (
                <EyeSlashIcon className="h-4 w-4" weight="bold" />
              )}
            </button>
          )}
        </div>
      )}

      {output.targets.map((target) => {
        const isExpanded = expanded.has(target.diceNumber);
        const filteredScenarios =
          currentBid !== undefined && !showAll
            ? target.scenarios.filter((s) => s.numMatches >= currentBid)
            : target.scenarios;
        const best = filteredScenarios.find((s) => s.probability >= 0.5);
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
              {isExpanded && filteredScenarios.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 overflow-hidden rounded-lg border border-border">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted">
                          <th className="w-14 border-b border-r border-border p-1.5 text-left font-medium">
                            #
                          </th>
                          <th className="border-b border-r border-border p-1.5 text-left font-medium">
                            Probability
                          </th>
                          <th className="border-b border-border p-1.5 text-left font-medium">
                            Spot On
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredScenarios.map((scenario, index) => {
                          const pct = (scenario.probability * 100).toFixed(1);
                          const spotOn = (
                            scenario.spotOnProbability * 100
                          ).toFixed(1);
                          const isLast =
                            index === filteredScenarios.length - 1;
                          const isBestBid =
                            bestBid !== null &&
                            target.diceNumber === bestBid.faceValue &&
                            scenario.numMatches === bestBid.quantity;
                          const isBelowBid =
                            currentBid !== undefined &&
                            scenario.numMatches <= currentBid;
                          return (
                            <tr key={scenario.numMatches}>
                              <td
                                className={`${isLast ? "" : "border-b"} border-r border-border p-1.5 font-semibold ${isBestBid ? "bg-foreground text-background" : isBelowBid ? "text-muted-foreground/40" : ""}`}
                              >
                                {scenario.numMatches}
                              </td>
                              <td
                                className={`${isLast ? "" : "border-b"} border-r border-border p-1.5 font-medium tabular-nums`}
                                style={probColor(scenario.probability)}
                              >
                                {pct}%
                              </td>
                              <td
                                className={`${isLast ? "" : "border-b"} border-border p-1.5 tabular-nums`}
                                style={probColor(scenario.spotOnProbability)}
                              >
                                {spotOn}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {isExpanded && filteredScenarios.length === 0 && (
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
