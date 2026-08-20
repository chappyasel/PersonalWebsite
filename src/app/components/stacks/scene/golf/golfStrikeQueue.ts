import type { GolfBallId, GolfBallState } from "./golfTypes";

export const GOLF_STRIKE_TIMING = {
  address: 0.12,
  backswing: 0.34,
  downswing: 0.14,
  recovery: 0.38,
} as const;

export const GOLF_IMPACT_AT =
  GOLF_STRIKE_TIMING.address +
  GOLF_STRIKE_TIMING.backswing +
  GOLF_STRIKE_TIMING.downswing;
export const GOLF_COMPLETE_AT = GOLF_IMPACT_AT + GOLF_STRIKE_TIMING.recovery;

export type GolfStrikeStage =
  | "idle"
  | "address"
  | "backswing"
  | "downswing"
  | "recovery";

export type GolfStrikeSnapshot = {
  queued: GolfBallId[];
  current: GolfBallId | null;
  elapsed: number;
  stage: GolfStrikeStage;
};

/** A visible club tap must finish even if it originated from the neighbouring
 * shelf's camera zone. The active section keeps the idle rig animated; an
 * explicit queued/current strike is sufficient to run the strike sequence. */
export function shouldAdvanceGolfStrike(
  active: boolean,
  strike: Pick<GolfStrikeSnapshot, "current" | "queued">,
) {
  return active || Boolean(strike.current) || strike.queued.length > 0;
}

export function nextReadyGolfBall(
  balls: ReadonlyArray<Pick<GolfBallState, "id" | "phase">>,
  order: readonly GolfBallId[],
): GolfBallId | null {
  return (
    order.find((id) =>
      balls.some((ball) => ball.id === id && ball.phase === "ready"),
    ) ?? null
  );
}

export class GolfStrikeQueue {
  private queued: GolfBallId[] = [];
  private reserved = new Set<GolfBallId>();
  private current: GolfBallId | null = null;
  private elapsed = 0;
  private launched = false;

  tap(id: GolfBallId) {
    if (this.reserved.has(id)) return false;
    this.reserved.add(id);
    this.queued.push(id);
    return true;
  }

  /** Advances the serial club animation and returns the ball whose impact
   * frame was crossed, if any. Large frame deltas cannot skip contact. */
  advance(delta: number): GolfBallId | null {
    if (!this.current) {
      this.current = this.queued.shift() ?? null;
      this.elapsed = 0;
      this.launched = false;
    }
    if (!this.current) return null;
    const before = this.elapsed;
    this.elapsed += Math.max(0, delta);
    let impact: GolfBallId | null = null;
    if (
      !this.launched &&
      before < GOLF_IMPACT_AT &&
      this.elapsed >= GOLF_IMPACT_AT
    ) {
      this.launched = true;
      impact = this.current;
    }
    if (this.elapsed >= GOLF_COMPLETE_AT) {
      this.current = null;
      this.elapsed = 0;
      this.launched = false;
    }
    return impact;
  }

  release(id: GolfBallId) {
    this.reserved.delete(id);
  }

  cancel() {
    this.queued = [];
    this.reserved.clear();
    this.current = null;
    this.elapsed = 0;
    this.launched = false;
  }

  snapshot(): GolfStrikeSnapshot {
    return {
      queued: [...this.queued],
      current: this.current,
      elapsed: this.elapsed,
      stage: this.stage(),
    };
  }

  private stage(): GolfStrikeStage {
    if (!this.current) return "idle";
    if (this.elapsed < GOLF_STRIKE_TIMING.address) return "address";
    if (
      this.elapsed <
      GOLF_STRIKE_TIMING.address + GOLF_STRIKE_TIMING.backswing
    )
      return "backswing";
    if (this.elapsed < GOLF_IMPACT_AT) return "downswing";
    return "recovery";
  }
}
