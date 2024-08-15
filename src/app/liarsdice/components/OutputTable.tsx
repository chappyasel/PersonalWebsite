import React from "react";

import { type Output } from "~/lib/liarsdice";

export interface Props {
  output: Output;
}

export default function OutputTable({ output }: Props) {
  return (
    <>
      {output.targets.map((target) => (
        <div key={target.diceNumber} className="w-full rounded-lg">
          <h1 className="pb-2 text-lg font-bold">
            Odds for {target.diceNumber}s (you have {target.alreadyHave}):
          </h1>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-200">
                <th className="w-[50px] border p-1">#</th>
                <th className="w-[100px] border p-1">Probability</th>
                <th className="w-[100px] border p-1">Spot On</th>
              </tr>
            </thead>
            <tbody>
              {target.scenarios.map((scenario, index) => {
                const probability = (scenario.probability * 100).toFixed(2);
                const spotOn = (scenario.spotOnProbability * 100).toFixed(2);
                return (
                  <tr key={index} className="odd:bg-white even:bg-gray-100">
                    <td className="border p-1">{scenario.numMatches}</td>
                    <td className="border p-1">{probability}%</td>
                    <td className="border p-1">{spotOn}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
