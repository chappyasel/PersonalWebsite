import { factorial } from "./factorials";

export interface Input {
  myDice: number[];
  totalDice: number;
  countOnes: boolean;
  currentBid?: number;
  minProbability?: number;
}

export interface Output {
  input: Input;
  targets: DiceTarget[];
  bestBid: BestBid | null;
}

export interface BestBid {
  faceValue: number;
  quantity: number;
  probability: number;
}

export interface DiceTarget {
  diceNumber: number;
  alreadyHave: number;
  scenarios: DiceScenario[];
}

export interface DiceScenario {
  numMatches: number;
  probability: number;
  spotOnProbability: number;
}

export function play(input: Input): Output {
  const { myDice, totalDice, countOnes, currentBid, minProbability = 0.01 } = input;

  const myDiceCount = myDice.reduce((acc, val) => acc + val, 0);
  const numUnknownDice = totalDice - myDiceCount;

  const targets: DiceTarget[] = [];
  let bestBid: BestBid | null = null;

  for (let diceNumber = 1; diceNumber <= 6; diceNumber++) {
    const includeOnes = countOnes && diceNumber !== 1;
    const alreadyHave =
      (includeOnes ? (myDice[0] ?? 0) : 0) + (myDice[diceNumber - 1] ?? 0);

    let currentProbability = 1.0;
    const scenarios: DiceScenario[] = [];

    for (let target = alreadyHave; target <= totalDice; target++) {
      const prob = probability(
        target - alreadyHave,
        numUnknownDice,
        includeOnes,
      );

      if (currentProbability < minProbability) {
        break;
      }

      if (currentProbability < 1 - minProbability) {
        scenarios.push({
          numMatches: target,
          probability: currentProbability,
          spotOnProbability: prob,
        });

        // Track best bid: highest quantity with >= 50% probability (above current bid if set)
        if (
          currentProbability >= 0.5 &&
          (!currentBid || target > currentBid) &&
          (!bestBid ||
            target > bestBid.quantity ||
            (target === bestBid.quantity &&
              currentProbability > bestBid.probability))
        ) {
          bestBid = {
            faceValue: diceNumber,
            quantity: target,
            probability: currentProbability,
          };
        }
      }

      currentProbability -= prob;
    }

    targets.push({
      diceNumber,
      alreadyHave,
      scenarios,
    });
  }

  return { input, targets, bestBid };
}

function probability(
  target: number,
  total: number,
  countOnes: boolean,
): number {
  const sides = countOnes ? 3 : 6;
  const odds =
    Math.pow(1.0 / sides, target) *
    Math.pow((sides - 1.0) / sides, total - target);
  return (
    (factorial(total) / (factorial(target) * factorial(total - target))) * odds
  );
}
