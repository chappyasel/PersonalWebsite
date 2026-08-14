export type DurableQualityRung = 0 | 1 | 2 | 3;
export type QualityTransitionReason = "decline" | "recovery" | "forced";

export type QualityState = {
  durable: DurableQualityRung;
  moving: boolean;
  lastTransitionAt: number;
  recoveryUsed: boolean;
  stableSince: number | null;
};

export type QualityEvent =
  | { type: "decline"; now: number }
  | { type: "incline"; now: number }
  | { type: "unstable" }
  | { type: "recover"; now: number }
  | { type: "movement"; moving: boolean }
  | { type: "force"; rung: DurableQualityRung; now: number };

export const QUALITY_TRANSITION_COOLDOWN_MS = 10_000;
export const QUALITY_RECOVERY_STABLE_MS = 25_000;

/**
 * Native 3x remains available for a 390x844 phone (2.96 MP), while larger
 * touch canvases and desktop Retina panels are bounded by physical area.
 * The desktop budget preserves 2x at both 1440x900 and 2048x613.
 */
export const PHYSICAL_PIXEL_BUDGET = {
  touch: 3_100_000,
  desktop: 5_200_000,
} as const;

export const DPR_CAP_BY_RUNG: ReadonlyArray<number> = [3, 2.75, 2.5, 2];

export function initialQualityState(
  forced?: DurableQualityRung | null,
): QualityState {
  return {
    durable: forced ?? 0,
    moving: false,
    lastTransitionAt: forced == null ? -Infinity : 0,
    recoveryUsed: forced != null,
    stableSince: null,
  };
}

export function reduceQuality(
  state: QualityState,
  event: QualityEvent,
): QualityState {
  switch (event.type) {
    case "decline": {
      if (
        state.durable >= 3 ||
        event.now - state.lastTransitionAt < QUALITY_TRANSITION_COOLDOWN_MS
      ) {
        return { ...state, stableSince: null };
      }
      return {
        ...state,
        durable: (state.durable + 1) as DurableQualityRung,
        lastTransitionAt: event.now,
        stableSince: null,
      };
    }
    case "incline":
      if (
        state.durable === 0 ||
        state.recoveryUsed ||
        state.stableSince != null
      )
        return state;
      return { ...state, stableSince: event.now };
    case "unstable":
      return state.stableSince == null
        ? state
        : { ...state, stableSince: null };
    case "recover":
      if (
        state.durable === 0 ||
        state.recoveryUsed ||
        state.stableSince == null ||
        event.now - state.stableSince < QUALITY_RECOVERY_STABLE_MS ||
        event.now - state.lastTransitionAt < QUALITY_TRANSITION_COOLDOWN_MS
      ) {
        return state;
      }
      return {
        ...state,
        durable: (state.durable - 1) as DurableQualityRung,
        lastTransitionAt: event.now,
        stableSince: null,
        recoveryUsed: true,
      };
    case "movement":
      return state.moving === event.moving
        ? state
        : { ...state, moving: event.moving };
    case "force":
      return {
        ...state,
        durable: event.rung,
        lastTransitionAt: event.now,
        recoveryUsed: true,
        stableSince: null,
      };
  }
}

export function resolveDpr({
  cssWidth,
  cssHeight,
  deviceDpr,
  rung,
  touch,
}: {
  cssWidth: number;
  cssHeight: number;
  deviceDpr: number;
  rung: DurableQualityRung;
  touch: boolean;
}): number {
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const budget = touch
    ? PHYSICAL_PIXEL_BUDGET.touch
    : PHYSICAL_PIXEL_BUDGET.desktop;
  const areaCap = Math.sqrt(budget / cssPixels);
  return Math.max(1, Math.min(deviceDpr, DPR_CAP_BY_RUNG[rung]!, areaCap));
}

export function meadowQualityRung(
  durable: DurableQualityRung,
  _moving: boolean,
): 0 | 1 | 2 | 3 {
  // Instance-count changes are discrete and visibly pop. Travel can simplify
  // continuous shader work, but meadow density follows durable quality only.
  return (3 - durable) as 0 | 1 | 2 | 3;
}

export function cloudDetailEnabled(
  skySimplify: boolean,
  _moving: boolean,
): boolean {
  // Cloud structure is spatially coherent world state. Swapping the compiled
  // material during travel makes the sky visibly morph around the camera.
  return !skySimplify;
}

export function landmarkDetailEnabled(cloudSimplify: boolean): boolean {
  void cloudSimplify;
  // These analytic landmarks are cheap relative to the framebuffer passes
  // and carry the scene's identity. Cloud cost must not erase the skyline.
  return true;
}

export function tiltShiftEnabled(
  postprocessing: "full" | "finish" | "off",
  depthOfField: boolean,
  disabledBySearch: boolean,
): boolean {
  void depthOfField;
  return postprocessing !== "off" && !disabledBySearch;
}

export function postprocessingQuality(
  durable: DurableQualityRung,
): "full" | "finish" | "off" {
  if (durable === 0) return "full";
  if (durable < 3) return "finish";
  return "off";
}

export function forcedQualityFromSearch(
  search: string,
): DurableQualityRung | null {
  const raw = new URLSearchParams(search).get("quality");
  if (raw === "0" || raw === "1" || raw === "2" || raw === "3")
    return Number(raw) as DurableQualityRung;
  return null;
}
