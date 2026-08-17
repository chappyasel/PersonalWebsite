import type { GolfShotOutcome } from "./golfTypes";

export type GolfBagMode = "production" | "development";
export type GolfRandom = () => number;

export function seededGolfRandom(seed: number): GolfRandom {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function golfBagComposition(mode: GolfBagMode): GolfShotOutcome[] {
  return mode === "development"
    ? ["hole-bound", "near-miss", "ordinary-green"]
    : [
        "hole-bound",
        ...Array<GolfShotOutcome>(3).fill("near-miss"),
        ...Array<GolfShotOutcome>(15).fill("ordinary-green"),
        "rare-miss",
      ];
}

export function shuffledGolfBag(
  mode: GolfBagMode,
  random: GolfRandom,
  previous?: GolfShotOutcome,
) {
  const bag = golfBagComposition(mode);
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  if (previous === "hole-bound" && bag[0] === "hole-bound") {
    const swap = bag.findIndex((outcome) => outcome !== "hole-bound");
    const first = bag[0];
    const replacement = bag[swap];
    if (first && replacement) {
      bag[0] = replacement;
      bag[swap] = first;
    }
  }
  return bag;
}

export class GolfShotBag {
  private bag: GolfShotOutcome[] = [];
  private cursor = 0;
  private previous: GolfShotOutcome | undefined;
  private retryAfter = -1;
  private forced: GolfShotOutcome | null = null;
  private cycleSatisfied = false;

  constructor(
    private readonly mode: GolfBagMode,
    private readonly random: GolfRandom = Math.random,
  ) {}

  next(): GolfShotOutcome {
    if (this.forced) {
      const outcome = this.forced;
      this.forced = null;
      this.previous = outcome;
      return outcome;
    }
    if (this.retryAfter === 0 && this.previous !== "hole-bound") {
      this.retryAfter = -1;
      this.previous = "hole-bound";
      return "hole-bound";
    }
    if (this.cursor >= this.bag.length) {
      this.bag = shuffledGolfBag(this.mode, this.random, this.previous);
      this.cursor = 0;
      this.cycleSatisfied = false;
    }
    let outcome = this.bag[this.cursor++]!;
    if (outcome === "hole-bound" && this.cycleSatisfied) {
      outcome = "ordinary-green";
    }
    if (this.retryAfter > 0 && outcome === "hole-bound") {
      const swap = this.bag.findIndex(
        (candidate, index) =>
          index >= this.cursor && candidate !== "hole-bound",
      );
      if (swap >= 0) {
        outcome = this.bag[swap]!;
        this.bag[swap] = "hole-bound";
      } else {
        // The tiny development bag can exhaust its non-winners. Preserve the
        // protected delay with an ordinary shot; the deferred winner is
        // injected once the two-shot guard reaches zero.
        outcome = "ordinary-green";
      }
    }
    if (outcome === "hole-bound" && this.previous === "hole-bound") {
      const swap = this.bag.findIndex(
        (candidate, index) =>
          index >= this.cursor && candidate !== "hole-bound",
      );
      if (swap >= 0) {
        outcome = this.bag[swap]!;
        this.bag[swap] = "hole-bound";
      }
    }
    if (this.retryAfter > 0 && outcome !== "hole-bound") this.retryAfter -= 1;
    this.previous = outcome;
    return outcome;
  }

  retryWinner() {
    this.retryAfter = Math.max(this.retryAfter, 2);
  }

  recordNaturalHole() {
    this.retryAfter = -1;
    this.cycleSatisfied = true;
  }

  force(outcome: GolfShotOutcome) {
    this.forced = outcome;
  }

  snapshot() {
    return {
      mode: this.mode,
      remaining: this.bag.slice(this.cursor),
      previous: this.previous ?? null,
      retryAfter: this.retryAfter,
      forced: this.forced,
      cycleSatisfied: this.cycleSatisfied,
    };
  }
}
