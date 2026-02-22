"use client";

import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import React, { useCallback, useMemo } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { type Input as LiarsDiceInput } from "~/lib/liarsdice";
import { expectedValue } from "~/lib/liarsdice/util";

import DiceFace from "./DiceFace";

export interface Props {
  onChange: (input: LiarsDiceInput) => void;
  input: LiarsDiceInput;
}

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

export default function InputForm({ onChange, input }: Props) {
  const diceString = useMemo(() => diceToString(input.myDice), [input.myDice]);
  const myDiceCount = input.myDice.reduce((a, b) => a + b, 0);
  const minTotal = myDiceCount;
  const maxTotal = 78;

  const handleDiceInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^1-6]/g, "");
      const myDice = parseDiceString(raw);
      const myCount = myDice.reduce((a, b) => a + b, 0);
      const totalDice =
        input.totalDice < myCount ? myCount : input.totalDice;
      onChange({ ...input, myDice, totalDice });
    },
    [input, onChange],
  );

  const setTotalDice = useCallback(
    (val: number) => {
      const clamped = Math.max(minTotal, Math.min(maxTotal, val));
      onChange({ ...input, totalDice: clamped });
    },
    [input, onChange, minTotal],
  );

  const handleTotalInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) setTotalDice(val);
    },
    [setTotalDice],
  );

  const diceValues: number[] = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < (input.myDice[i] ?? 0); j++) {
        vals.push(i + 1);
      }
    }
    return vals;
  }, [input.myDice]);

  return (
      <div className="flex flex-col gap-3">
        {/* Dice Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Your dice
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={diceString}
              onChange={handleDiceInput}
              inputMode="numeric"
              pattern="[1-6]*"
              placeholder="e.g. 213166"
              className="font-mono text-[16px]"
            />
            <div className="flex shrink-0 items-center -space-x-0.5">
              {Array.from({ length: 5 }, (_, i) => {
                const val = diceValues[i];
                return val ? (
                  <DiceFace
                    key={i}
                    value={val}
                    className="h-7 w-7 text-foreground"
                  />
                ) : (
                  <div key={i} className="flex h-7 w-7 items-center justify-center">
                    <div className="h-5 w-5 rounded border border-dashed border-border" />
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Total Dice Stepper */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Total dice in play
          </label>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTotalDice(input.totalDice - 1)}
              disabled={input.totalDice <= minTotal}
              className="h-8 w-8 shrink-0"
            >
              <MinusIcon className="h-3.5 w-3.5" weight="bold" />
            </Button>
            <Input
              value={input.totalDice}
              onChange={handleTotalInput}
              inputMode="numeric"
              pattern="[0-9]*"
              className="h-8 w-14 text-center text-[16px] font-semibold"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTotalDice(input.totalDice + 1)}
              disabled={input.totalDice >= maxTotal}
              className="h-8 w-8 shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" weight="bold" />
            </Button>
            <span className="text-xs text-muted-foreground">
              EV {expectedValue(input.totalDice)}
            </span>
          </div>
        </div>
      </div>
  );
}
