"use client";

import React, { useEffect, useState } from "react";

import { type Input, type Output, play } from "~/lib/liarsdice";

import InputForm from "./components/InputForm";
import OutputTable from "./components/OutputTable";

const DEFAULT_INPUT: Input = {
  myDice: [2, 0, 1, 0, 0, 2],
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
      <InputForm onChange={setInput} input={input} />
      {output && <OutputTable output={output} />}
    </main>
  );
}
