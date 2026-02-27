"use client";

import { CalculatorIcon, DiceOneIcon, HouseLineIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { Separator } from "~/components/ui/separator";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { type Input, type Output, play } from "~/lib/liarsdice";

import InputForm from "./components/InputForm";
import OutputTable from "./components/OutputTable";
import { searchParamsParsers } from "./lib/searchParams";

function parseDiceString(str: string): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const ch of str) {
    const n = parseInt(ch, 10);
    if (n >= 1 && n <= 6) counts[n - 1]!++;
  }
  return counts;
}

function diceToString(dice: number[]): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += String(i + 1).repeat(dice[i] ?? 0);
  }
  return s;
}

export default function LiarsDicePage() {
  return (
    <Suspense>
      <LiarsDiceContent />
    </Suspense>
  );
}

function LiarsDiceContent() {
  const [params, setParams] = useQueryStates(searchParamsParsers, {
    history: "replace",
  });
  const [isHovered, setIsHovered] = useState(false);

  const input: Input = useMemo(
    () => ({
      myDice: parseDiceString(params.dice),
      totalDice: params.total,
      countOnes: params.wild,
      currentBid: params.bid ?? undefined,
    }),
    [params],
  );

  const setInput = useCallback(
    (newInput: Input) => {
      void setParams({
        dice: diceToString(newInput.myDice) || null,
        total: newInput.totalDice,
        wild: newInput.countOnes,
        bid: newInput.currentBid ?? null,
      });
    },
    [setParams],
  );

  const [output, setOutput] = useState<Output>();

  useEffect(() => {
    const result = play(input);
    setOutput(result);
  }, [input]);

  return (
    <main className="m-auto flex max-w-xl flex-col items-center gap-4 p-4 font-sans">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <Link
          href={
            process.env.NODE_ENV === "production"
              ? "https://chappyasel.com"
              : "http://localhost:3000"
          }
          className="group inline-flex items-center gap-2 text-xl font-semibold text-foreground transition-opacity hover:opacity-80"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <span className="relative inline-flex h-5 w-5 items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {isHovered ? (
                <motion.div
                  key="house-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <HouseLineIcon className="h-5 w-5" weight="bold" />
                </motion.div>
              ) : (
                <motion.div
                  key="calculator-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <CalculatorIcon className="h-5 w-5" weight="bold" />
                </motion.div>
              )}
            </AnimatePresence>
          </span>
          Liar&apos;s Dice Calculator
        </Link>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={() =>
                    setInput({ ...input, countOnes: !input.countOnes })
                  }
                  aria-label="Toggle ones are wild"
                  className={`flex size-10 items-center justify-center rounded-md text-sm transition-all hover:bg-secondary/80 hover:text-foreground ${
                    input.countOnes
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <DiceOneIcon
                    className="h-4 w-4"
                    weight={input.countOnes ? "fill" : "regular"}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Ones are wild:{" "}
                  <span className="font-semibold">
                    {input.countOnes ? "ON" : "OFF"}
                  </span>
                </p>
              </TooltipContent>
            </Tooltip>
            <ThemeToggle />
          </div>
        </TooltipProvider>
      </div>

      {/* Sticky Input */}
      <div className="sticky top-0 z-10 w-full rounded-lg border bg-background/95 p-4 shadow-sm backdrop-blur-sm">
        <InputForm input={input} onChange={setInput} />
      </div>

      <Separator />

      {output && <OutputTable output={output} currentBid={input.currentBid} />}
    </main>
  );
}
