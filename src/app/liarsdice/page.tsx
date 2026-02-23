"use client";

import { DiceOneIcon } from "@phosphor-icons/react";
import React, { useEffect, useState } from "react";

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

const DEFAULT_INPUT: Input = {
  myDice: [0, 0, 0, 0, 0, 0],
  totalDice: 20,
  countOnes: true,
};

export default function LiarsDicePage() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [output, setOutput] = useState<Output>();

  useEffect(() => {
    const result = play(input);
    setOutput(result);
  }, [input]);

  return (
    <main className="m-auto flex max-w-xl flex-col items-center gap-4 p-4 font-sans">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">
          Liar&apos;s Dice Calculator
        </h1>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={() =>
                    setInput((prev) => ({
                      ...prev,
                      countOnes: !prev.countOnes,
                    }))
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

      {output && <OutputTable output={output} />}
    </main>
  );
}
