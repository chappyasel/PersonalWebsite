import React from "react";

import { type Input } from "~/lib/liarsdice";
import { expectedValue, numberToString } from "~/lib/liarsdice/util";

export interface Props {
  onChange: (input: Input) => void;
  input: Input;
}

export default function InputForm({ onChange, input }: Props) {
  return (
    <form className="flex flex-col gap-1">
      <div className="flex gap-1">
        {input.myDice.map((numDice, index) => (
          <div
            key={index}
            className="flex flex-col justify-center rounded-lg bg-gray-200 p-1"
          >
            <label className="w-full text-center text-sm font-bold">
              {numberToString(index)}
            </label>
            <input
              type="number"
              className="w-full rounded-lg p-1 text-center text-sm font-semibold"
              value={numDice}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const myDice = input.myDice;
                myDice[index] = parseInt(e.target.value, 10);
                onChange({ ...input, myDice });
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex w-full gap-1">
        <div className="flex flex-1 flex-col justify-center rounded-lg bg-gray-200 p-1">
          <label className="w-full text-center text-sm font-bold">
            Dice left (EV {expectedValue(input.totalDice)})
          </label>
          <input
            type="number"
            className="w-full rounded-lg p-1 text-center text-sm font-semibold"
            value={input.totalDice}
            onChange={(e) =>
              onChange({ ...input, totalDice: parseInt(e.target.value, 10) })
            }
          />
        </div>
        <div className="flex flex-1 flex-col justify-center rounded-lg bg-gray-200 p-1">
          <input
            type="checkbox"
            id="countOnes"
            checked={input.countOnes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ ...input, countOnes: e.target.checked })
            }
          />
          <label
            htmlFor="countOnes"
            className="w-full text-center text-sm font-bold"
          >
            Ones are wild
          </label>
        </div>
      </div>
    </form>
  );
}
