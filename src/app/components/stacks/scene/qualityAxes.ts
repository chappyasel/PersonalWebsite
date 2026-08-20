import {
  QUALITY_SAMPLE_WINDOW_MS,
  QUALITY_TRAVEL_VALIDATION_MS,
  SCENE_CONTENT_TIERS,
  SCENE_EFFECTS_TIERS,
  SCENE_FRAME_BUDGET_MS,
  SCENE_RESOLUTION_SCALE_FLOOR,
  SCENE_RESOLUTION_STEPS,
  SCENE_RESOLUTION_STEP_MAX,
  type SceneContentTier,
  type SceneEffectsTier,
  type SceneFrameConstraint,
  type SceneQualityMetrics,
  type SceneQualityProfile,
  classifySceneFrameConstraint,
  sceneResolutionScale,
} from "./quality";

// The three-axis quality controller.
//
// WHY THIS IS SEPARATE FROM quality.ts. quality.ts owns the profile table and
// the plan every consumer already reads. This module owns the decision of
// where on the three axes to stand. Keeping them apart means the axis policy
// is a pure reducer with no rendering surface, so its timing rules can be
// driven directly by tests rather than inferred from a rendered frame.
//
// The axes and their time constants:
//
//   resolution   12 steps, 1500 ms dwell        cheapest, most reversible,
//                                               invisible in motion
//   effects      4 tiers, 5 s fall / 15 s rise  a GPU cost
//   content      3 tiers, 10 s fall / 60 s rise a main-thread and geometry
//                                               cost, and the visible one
//
// Every duration below is a minimum SUSTAINED duration of a classification,
// never a fixed timer. A window that breaks the classification resets that
// axis's clock to zero. That is what makes the controller act on evidence
// rather than on the calendar.

/** Twelve steps, so a single step is small enough to pass unnoticed. */
export const SCENE_RESOLUTION_STEP_COUNT = SCENE_RESOLUTION_STEPS;
export const SCENE_RESOLUTION_MAX_STEP = SCENE_RESOLUTION_STEP_MAX;
/** Below this the image stops reading as the same scene. Defined in quality.ts
 * because the plan clamps against it too, and two copies would drift. */
export const SCENE_RESOLUTION_FLOOR = SCENE_RESOLUTION_SCALE_FLOOR;

export const QUALITY_RESOLUTION_DWELL_MS = 1_500;
export const QUALITY_RESOLUTION_RISE_MS = 3_000;
/** A lower step that restored headroom is a known-good operating point. Do
 * not immediately revisit the step that just missed budget: that creates a
 * two-state DPR oscillator, and every reversal reallocates Safari's drawing
 * buffer. A minute still permits genuine thermal recovery without turning a
 * transient good window into visible flashing. */
export const QUALITY_RESOLUTION_RETRY_MS = 60_000;
export const QUALITY_EFFECTS_FALL_MS = 5_000;
export const QUALITY_EFFECTS_RISE_MS = 15_000;
/** Re-enabling a spatial pass is a visible, allocative change. If the richer
 * tier immediately caused pressure, hold the known-good tier before retrying
 * so DoF and AO cannot cycle every fall/rise interval. */
export const QUALITY_EFFECTS_RETRY_MS = 60_000;
export const QUALITY_CONTENT_FALL_MS = 10_000;
export const QUALITY_CONTENT_RISE_MS = 60_000;

/** Travel is bounded and known in advance, so the headroom can be taken
 * before a frame is missed rather than after. */
/** How long the first-decline cap survives without corroborating evidence.
 *
 * The cap exists because a cold cache and a warm cache produce very different
 * first seconds. It must not become a permanent pin: on a device that never
 * produces an improved window, an evidence-only exit freezes quality after a
 * single step forever. Ten seconds sits past the boot gate's own reveal,
 * precompile and travel-validation wait, so what remains is the settling a
 * cold cache does, and no more. */
export const QUALITY_BOOT_GUARD_MS = 10_000;

/** How long one axis's change blocks the others without showing improvement.
 *
 * Two sampling windows: by then the window is composed entirely of
 * post-change frames and has had a second window to demonstrate a gain. An
 * evidence-only exit deadlocks, because a device whose measurements do not
 * move never produces the improvement the block waits for, and a change that
 * did not help is precisely the signal to try the next lever. */
export const QUALITY_AXIS_BLOCK_MS = QUALITY_SAMPLE_WINDOW_MS * 2;

export const QUALITY_TRAVEL_RESOLUTION_DROP_STEPS = 2;
/** A travel is over budget on the same dropped-frame test the rest budget
 * uses, applied to the travel's own frames. */
export const QUALITY_TRAVEL_DROPPED_RATIO = 0.2;
/** One unlucky transition must change nothing; a consistent pattern must. */
export const QUALITY_TRAVEL_OVER_BUDGET_LIMIT = 3;

/** The improvement a change has to show before another axis may move. These
 * are the thresholds the existing decline-baseline guard already uses. */
export const QUALITY_AXIS_P95_IMPROVEMENT_RATIO = 0.9;
export const QUALITY_AXIS_DROP_IMPROVEMENT = 0.03;
/** Severe pressure overrides the one-axis-at-a-time block, because waiting
 * for proof is a luxury a scene this far behind cannot afford. */
export const QUALITY_SEVERE_P95_MULTIPLIER = 1.75;
export const QUALITY_SEVERE_DROPPED_RATIO = 0.35;

export type QualityAxisName = "resolution" | "effects" | "content";

export type SceneQualityAxes = Readonly<{
  /** 0 is the floor, 11 is the ceiling. */
  resolutionStep: number;
  effects: SceneEffectsTier;
  content: SceneContentTier;
}>;

export type QualityAxisChange = Readonly<{
  axis: QualityAxisName;
  direction: "down" | "up";
  reason:
    | "pressure"
    | "headroom"
    | "travel-start"
    | "travel-restore"
    | "travel-budget"
    | "deferred";
}>;

export type SceneQualityAxisState = Readonly<{
  axes: SceneQualityAxes;
  /** Pinned tiers when a preset is forced. Resolution stays free. */
  forced: SceneQualityProfile | null;
  travelling: boolean;
  /** Step to restore toward once travel has been validated. */
  preTravelStep: number | null;
  travelFrames: Readonly<{ total: number; late: number }>;
  consecutiveOverBudgetTravels: number;
  /** Set when travel ends; sampling resumes as evidence only after it. */
  settledAt: number | null;
  /** When each axis last moved. An axis must re-earn its full sustain before
   * moving again, which is what paces one axis without freezing the others. */
  axisChangedAt: Readonly<Record<QualityAxisName, number>>;
  /** Earliest time Auto may retry a higher resolution after GPU pressure
   * established that the previous step missed budget. */
  resolutionRetryAt: number | null;
  /** Earliest time Auto may retry a richer effects tier after GPU pressure. */
  effectsRetryAt: number | null;
  /** How long the current classification has held. These track the run of
   * windows only: a window that breaks the classification resets them, and an
   * axis moving does not, so a slow axis can still accumulate evidence while
   * a fast one is working. */
  gpuSince: number | null;
  cpuSince: number | null;
  headroomSince: number | null;
  /** The window that justified the last change, held until a later window
   * shows the change helped. Null means no axis is blocked. */
  pendingBaseline: SceneQualityMetrics | null;
  /** When that block lapses even without an improved window. A change that
   * did not help is still information: it means the next lever should be
   * tried, not that the controller should stop. */
  pendingBaselineExpiresAt: number | null;
  lastChange: QualityAxisChange | null;
  /** Consecutive resolution steps that expired their block without improving
   * anything. Reset by any improvement, and by a rise. */
  /** At most one deferred content request. A deferral is a delayed decision,
   * not a promise: a later request replaces it, and it is discarded if the
   * classification that produced it no longer holds. */
  deferredContent: SceneContentTier | null;
  /** Until every boot precondition is met, no window is evidence about this
   * device. Parsing models, uploading textures and compiling shaders are the
   * worst frames the scene will ever produce and the least representative. */
  booted: boolean;
  /** Holds through the first decline after boot, so an unrepresentative
   * opening window cannot walk the scene to its lowest tier before a
   * representative frame has been drawn. */
  bootDeclineGuard: boolean;
  /** When that guard lapses regardless of evidence. A device that never
   * offers an improved window is exactly the device that needs to keep
   * degrading, so the guard must not be able to pin it after one step. */
  bootGuardExpiresAt: number | null;
}>;

const tierIndex = <T extends string>(tiers: readonly T[], value: T) =>
  Math.max(0, tiers.indexOf(value));

const lowerTier = <T extends string>(
  tiers: readonly T[],
  value: T,
): T | null =>
  tierIndex(tiers, value) <= 0 ? null : tiers[tierIndex(tiers, value) - 1]!;

const higherTier = <T extends string>(
  tiers: readonly T[],
  value: T,
  ceiling: T,
): T | null => {
  const next = tierIndex(tiers, value) + 1;
  if (next > tierIndex(tiers, ceiling)) return null;
  return tiers[next] ?? null;
};

/**
 * Resolution scale for a step, spaced geometrically between the floor and the
 * ceiling.
 *
 * Geometric rather than linear because each step should feel the same size
 * wherever the ceiling sits. Linear spacing on a device with a high ceiling
 * would make the first steps imperceptible and the last ones cliff-like.
 */
export const resolutionScaleForStep = sceneResolutionScale;

/** The step whose scale is nearest a given resolution, used when restoring a
 * learned entry or mapping a preset's cap onto the ladder. */
export function resolutionStepForScale(scale: number, ceiling: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let step = 0; step <= SCENE_RESOLUTION_MAX_STEP; step += 1) {
    const distance = Math.abs(resolutionScaleForStep(step, ceiling) - scale);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = step;
    }
  }
  return best;
}

/** Presets as named points in the three-axis space. Effects tiers lift the
 * existing profile effect blocks with no numeric change, so each tier's look
 * is already reviewed and accepted. */
export const AXES_BY_PROFILE: Readonly<
  Record<
    SceneQualityProfile,
    Readonly<{ effects: SceneEffectsTier; content: SceneContentTier }>
  >
> = {
  cinematic: { effects: "cinematic", content: "full" },
  showcase: { effects: "full", content: "full" },
  balanced: { effects: "full", content: "full" },
  efficient: { effects: "lean", content: "reduced" },
  safety: { effects: "minimal", content: "minimal" },
};

export function initialSceneQualityAxisState(
  profile: SceneQualityProfile,
  now: number,
  forced: SceneQualityProfile | null = null,
  resolutionStep = SCENE_RESOLUTION_MAX_STEP,
): SceneQualityAxisState {
  return {
    axes: {
      resolutionStep,
      ...AXES_BY_PROFILE[profile],
    },
    forced,
    travelling: false,
    preTravelStep: null,
    travelFrames: { total: 0, late: 0 },
    consecutiveOverBudgetTravels: 0,
    settledAt: null,
    axisChangedAt: { resolution: now, effects: now, content: now },
    resolutionRetryAt: null,
    effectsRetryAt: null,
    gpuSince: null,
    cpuSince: null,
    headroomSince: null,
    pendingBaseline: null,
    pendingBaselineExpiresAt: null,
    lastChange: null,
    deferredContent: null,
    booted: false,
    bootDeclineGuard: true,
    bootGuardExpiresAt: null,
  };
}

export type SceneQualityAxisEvent =
  | Readonly<{
      type: "sample";
      now: number;
      metrics: SceneQualityMetrics;
      visible: boolean;
      /** False on WebKit/iOS, where changing DPR presents cleared black
       * frames while the drawing buffer is reallocated. */
      allowResolutionChange?: boolean;
    }>
  | Readonly<{
      type: "travel-start";
      now: number;
      allowResolutionChange?: boolean;
    }>
  | Readonly<{
      type: "travel-end";
      now: number;
      frames?: Readonly<{ total: number; late: number }>;
    }>
  | Readonly<{ type: "travel-frame"; frameMs: number }>
  | Readonly<{
      type: "force";
      now: number;
      profile: SceneQualityProfile | null;
    }>
  | Readonly<{ type: "restore"; now: number; axes: SceneQualityAxes }>
  /** Every boot precondition has been met: the reveal completed, the shader
   * precompile returned, and the first settled window after initial camera
   * placement passed travel validation. */
  | Readonly<{ type: "booted"; now: number }>;

const isSevere = (metrics: SceneQualityMetrics) =>
  metrics.p95 > SCENE_FRAME_BUDGET_MS * QUALITY_SEVERE_P95_MULTIPLIER ||
  metrics.droppedFrameRatio > QUALITY_SEVERE_DROPPED_RATIO;

const improvedOver = (
  metrics: SceneQualityMetrics,
  baseline: SceneQualityMetrics,
) =>
  metrics.p95 <= baseline.p95 * QUALITY_AXIS_P95_IMPROVEMENT_RATIO ||
  metrics.droppedFrameRatio <=
    Math.max(0, baseline.droppedFrameRatio - QUALITY_AXIS_DROP_IMPROVEMENT);

/** Clocks advance only while their classification holds; anything else stops
 * them. `sustainedFor` reads how long the current run has lasted. */
const sustainedFor = (since: number | null, now: number) =>
  since == null ? 0 : now - since;

function withClocks(
  state: SceneQualityAxisState,
  constraint: SceneFrameConstraint,
  now: number,
): SceneQualityAxisState {
  return {
    ...state,
    gpuSince: constraint === "gpu" ? (state.gpuSince ?? now) : null,
    cpuSince: constraint === "cpu" ? (state.cpuSince ?? now) : null,
    headroomSince:
      constraint === "headroom" ? (state.headroomSince ?? now) : null,
  };
}

/** Reset every classification run. Used when the evidence stops applying at
 * all — a travel boundary, or a preset being forced — rather than when an
 * axis moves. */
const clearedClocks = {
  gpuSince: null,
  cpuSince: null,
  headroomSince: null,
} as const;

/** Stamp an axis as just moved. Only that axis has to re-earn its sustain;
 * the classification runs keep going, so a slower axis on the same evidence
 * is not starved by a faster one repeatedly working. */
const moved = (
  state: SceneQualityAxisState,
  axis: QualityAxisName,
  now: number,
) => ({ ...state.axisChangedAt, [axis]: now });

/** Whether an axis has both observed its sustain and served it since its own
 * last move. */
const axisReady = (
  state: SceneQualityAxisState,
  axis: QualityAxisName,
  since: number | null,
  now: number,
  sustainMs: number,
) =>
  sustainedFor(since, now) >= sustainMs &&
  now - state.axisChangedAt[axis] >= sustainMs;

export function reduceSceneQualityAxes(
  state: SceneQualityAxisState,
  event: SceneQualityAxisEvent,
): SceneQualityAxisState {
  switch (event.type) {
    case "restore":
      return {
        ...state,
        axes: event.axes,
        axisChangedAt: {
          resolution: event.now,
          effects: event.now,
          content: event.now,
        },
        pendingBaseline: null,
        pendingBaselineExpiresAt: null,
        resolutionRetryAt:
          event.axes.resolutionStep < SCENE_RESOLUTION_MAX_STEP
            ? event.now + QUALITY_RESOLUTION_RETRY_MS
            : null,
        effectsRetryAt:
          event.axes.effects !== AXES_BY_PROFILE.showcase.effects
            ? event.now + QUALITY_EFFECTS_RETRY_MS
            : null,
        deferredContent: null,
        lastChange: null,
        ...clearedClocks,
      };

    case "force": {
      if (!event.profile) return { ...state, forced: null };
      return {
        ...state,
        forced: event.profile,
        // A forced preset pins the visible tiers. Resolution stays free, so a
        // forced Safety can still shed pixels under pressure.
        axes: { ...state.axes, ...AXES_BY_PROFILE[event.profile] },
        ...clearedClocks,
        pendingBaseline: null,
        effectsRetryAt: null,
        deferredContent: null,
      };
    }

    case "booted": {
      if (state.booted) return state;
      return {
        ...state,
        booted: true,
        bootGuardExpiresAt: event.now + QUALITY_BOOT_GUARD_MS,
        ...clearedClocks,
        axisChangedAt: {
          resolution: event.now,
          effects: event.now,
          content: event.now,
        },
      };
    }

    case "travel-start": {
      // Pre-emptive, and deliberately exempt from the dwell and from the
      // cross-axis block: this is a scheduled adjustment to a known event,
      // not a response to measured pressure, so it carries no evidence the
      // other axes should wait on.
      //
      // Borrow pixels only when pixels are what is short. The sampling path
      // already refuses to spend resolution on anything but GPU pressure,
      // because a pixel count cannot touch the main thread; taking it here
      // regardless contradicted that rule on exactly the devices that can
      // least afford it. Measured on a main-thread-bound profile, a 61
      // percent pixel cut bought 0.19 ms.
      //
      // It is not free, either. Every change resizes the drawing buffer, and
      // the compositor can drop the canvas layer for a frame while its
      // backing store is reallocated — which on this page shows the near
      // white paper behind the canvas. A transition did that at least twice,
      // once down and once on repayment.
      //
      // A travel that really is too expensive is still caught, after the
      // fact, by travel-end counting over-budget travels and content
      // stepping down once the pattern repeats. That path costs nothing when
      // the guess would have been wrong.
      const borrow =
        event.allowResolutionChange !== false && state.gpuSince != null;
      const step = borrow
        ? Math.max(
            0,
            state.axes.resolutionStep - QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
          )
        : state.axes.resolutionStep;
      const moved = step !== state.axes.resolutionStep;
      return {
        ...state,
        travelling: true,
        settledAt: null,
        // Only record a debt that was actually taken on, so repayment has
        // nothing to do when nothing was borrowed.
        preTravelStep: moved
          ? (state.preTravelStep ?? state.axes.resolutionStep)
          : state.preTravelStep,
        travelFrames: { total: 0, late: 0 },
        axes: { ...state.axes, resolutionStep: step },
        ...clearedClocks,
        // An axis that did not move must not have its dwell restarted, or
        // travelling repeatedly would hold resolution still indefinitely.
        axisChangedAt: moved
          ? { ...state.axisChangedAt, resolution: event.now }
          : state.axisChangedAt,
        lastChange: moved
          ? { axis: "resolution", direction: "down", reason: "travel-start" }
          : state.lastChange,
      };
    }

    case "travel-frame": {
      if (!state.travelling) return state;
      const late = event.frameMs > SCENE_FRAME_BUDGET_MS * 1.5;
      return {
        ...state,
        travelFrames: {
          total: state.travelFrames.total + 1,
          late: state.travelFrames.late + (late ? 1 : 0),
        },
      };
    }

    case "travel-end": {
      const { total, late } = event.frames ?? state.travelFrames;
      const overBudget =
        total > 0 && late / total > QUALITY_TRAVEL_DROPPED_RATIO;
      return {
        ...state,
        travelling: false,
        // Evidence about travel is not evidence about rest, so the count only
        // earns the right to step content down once it repeats.
        consecutiveOverBudgetTravels: overBudget
          ? state.consecutiveOverBudgetTravels + 1
          : 0,
        settledAt: event.now,
        travelFrames: { total: 0, late: 0 },
        ...clearedClocks,
      };
    }

    case "sample": {
      const { now, metrics, visible } = event;
      const allowResolutionChange = event.allowResolutionChange !== false;
      if (!visible || metrics.sampleCount < 2 || !Number.isFinite(metrics.p95))
        return state;
      // A cold cache and a warm cache produce very different first seconds.
      // Neither is evidence, so neither is consumed.
      if (!state.booted) return state;

      // A window inside travel may lower effects or request a later content
      // change, but it is never rest evidence. Once travel ends, wait until a
      // complete clean window has replaced it before acting at rest.
      if (
        !state.travelling &&
        state.settledAt != null &&
        now - state.settledAt < QUALITY_TRAVEL_VALIDATION_MS
      )
        return state;

      const constraint = classifySceneFrameConstraint(metrics);
      let next = withClocks(state, constraint, now);

      if (next.travelling) {
        if (next.forced) return next;
        if (
          constraint === "gpu" &&
          axisReady(
            next,
            "effects",
            next.gpuSince,
            now,
            QUALITY_EFFECTS_FALL_MS,
          )
        ) {
          const tier = lowerTier(SCENE_EFFECTS_TIERS, next.axes.effects);
          if (tier)
            return {
              ...next,
              axes: { ...next.axes, effects: tier },
              axisChangedAt: moved(next, "effects", now),
              effectsRetryAt: now + QUALITY_EFFECTS_RETRY_MS,
              lastChange: {
                axis: "effects",
                direction: "down",
                reason: "pressure",
              },
            };
        }
        if (
          constraint === "cpu" &&
          axisReady(
            next,
            "content",
            next.cpuSince,
            now,
            QUALITY_CONTENT_FALL_MS,
          )
        ) {
          const tier = lowerTier(SCENE_CONTENT_TIERS, next.axes.content);
          if (tier) return { ...next, deferredContent: tier };
        }
        return next;
      }

      // A settled window is the readiness test for applying a deferred
      // content change: a measurement question about whether the sample can
      // be trusted, not a scheduling question about affording the work.
      if (next.deferredContent) {
        const stillWanted = constraint === "cpu";
        const tier = next.deferredContent;
        next = { ...next, deferredContent: null };
        if (stillWanted && tier !== next.axes.content)
          return {
            ...next,
            axes: { ...next.axes, content: tier },
            ...clearedClocks,
            pendingBaseline: metrics,
            pendingBaselineExpiresAt: now + QUALITY_AXIS_BLOCK_MS,
            lastChange: {
              axis: "content",
              direction: "down",
              reason: "deferred",
            },
          };
      }

      const severe = isSevere(metrics);

      // One axis at a time. After a change, the OTHER axes wait until a later
      // window shows it helped, so a single bad window cannot cascade the
      // scene to its lowest state. The axis that moved is paced by its own
      // sustain instead, so a device under real, unrelieved pressure keeps
      // making progress on the cheapest lever rather than freezing.
      // Severe pressure normally overrides the block. It does not while the
      // boot guard holds: the whole point of the guard is that a severe-looking
      // opening window is exactly the one not to trust.
      // The guard lapses on evidence OR on its deadline, whichever comes
      // first. Evidence-only was a deadlock: identical windows never count as
      // improvement, so a steadily struggling device stayed pinned one step
      // below where it started, indefinitely.
      const guarding =
        next.bootDeclineGuard &&
        (next.bootGuardExpiresAt == null || now < next.bootGuardExpiresAt);
      if (next.bootDeclineGuard && !guarding)
        next = { ...next, bootDeclineGuard: false };

      const severeOverrides = severe && !guarding;
      // The boot cap outranks this deadline. Otherwise the deadline would
      // retire the cap four seconds in and the opening window could still
      // cascade, which is the thing the cap exists to prevent.
      const blockExpired =
        !guarding &&
        next.pendingBaselineExpiresAt != null &&
        now >= next.pendingBaselineExpiresAt;
      const blockedAxis = (axis: QualityAxisName) => {
        if (severeOverrides || !next.pendingBaseline || blockExpired)
          return false;
        if (next.lastChange?.axis === axis && !guarding) return false;
        return !improvedOver(metrics, next.pendingBaseline);
      };
      if (
        next.pendingBaseline &&
        (severeOverrides ||
          blockExpired ||
          improvedOver(metrics, next.pendingBaseline))
      )
        // The first decline has now been answered by a later window, so the
        // guard has done its job and normal pacing resumes.
        next = {
          ...next,
          pendingBaseline: null,
          pendingBaselineExpiresAt: null,
          bootDeclineGuard: false,
        };

      // Three consecutive over-budget travels earn one content step at rest.
      if (
        next.consecutiveOverBudgetTravels >= QUALITY_TRAVEL_OVER_BUDGET_LIMIT
      ) {
        const tier = lowerTier(SCENE_CONTENT_TIERS, next.axes.content);
        if (tier && !next.forced)
          return {
            ...next,
            axes: { ...next.axes, content: tier },
            consecutiveOverBudgetTravels: 0,
            axisChangedAt: moved(next, "content", now),
            pendingBaseline: metrics,
            pendingBaselineExpiresAt: now + QUALITY_AXIS_BLOCK_MS,
            lastChange: {
              axis: "content",
              direction: "down",
              reason: "travel-budget",
            },
          };
        return { ...next, consecutiveOverBudgetTravels: 0 };
      }

      const dwellElapsed =
        now - next.axisChangedAt.resolution >= QUALITY_RESOLUTION_DWELL_MS;

      // Travel borrowed resolution without evidence. Repay it after travel
      // validation, one target reallocation per dwell. CPU pressure does not
      // stop repayment because pixels cannot relieve it; GPU pressure does.
      if (next.preTravelStep != null) {
        const target = Math.min(SCENE_RESOLUTION_MAX_STEP, next.preTravelStep);
        if (next.axes.resolutionStep >= target) {
          next = { ...next, preTravelStep: null };
        } else if (constraint === "gpu") {
          next = { ...next, preTravelStep: null };
        } else if (dwellElapsed) {
          const step = Math.min(target, next.axes.resolutionStep + 1);
          return {
            ...next,
            axes: { ...next.axes, resolutionStep: step },
            axisChangedAt: moved(next, "resolution", now),
            preTravelStep: step >= target ? null : target,
            lastChange: {
              axis: "resolution",
              direction: "up",
              reason: "travel-restore",
            },
          };
        }
      }

      if (constraint === "gpu") {
        if (allowResolutionChange && next.axes.resolutionStep > 0) {
          if (blockedAxis("resolution")) return next;
          // A dwell that has not elapsed defers the whole decision rather
          // than passing the turn to a slower axis: a dwell is a short wait,
          // and spending a visible lever to avoid a short wait is backwards.
          if (!dwellElapsed) return next;
          return {
            ...next,
            axes: {
              ...next.axes,
              resolutionStep: next.axes.resolutionStep - 1,
            },
            axisChangedAt: moved(next, "resolution", now),
            pendingBaseline: metrics,
            pendingBaselineExpiresAt: now + QUALITY_AXIS_BLOCK_MS,
            resolutionRetryAt: now + QUALITY_RESOLUTION_RETRY_MS,
            lastChange: {
              axis: "resolution",
              direction: "down",
              reason: "pressure",
            },
          };
        }

        // Normally only the resolution floor passes GPU pressure to effects.
        // A platform-locked drawing buffer cannot spend that axis safely, so
        // it bypasses the unavailable lever instead of stalling forever.
        if (next.forced) return next;

        if (
          !blockedAxis("effects") &&
          axisReady(
            next,
            "effects",
            next.gpuSince,
            now,
            QUALITY_EFFECTS_FALL_MS,
          )
        ) {
          const tier = lowerTier(SCENE_EFFECTS_TIERS, next.axes.effects);
          if (tier)
            return {
              ...next,
              axes: { ...next.axes, effects: tier },
              axisChangedAt: moved(next, "effects", now),
              pendingBaseline: metrics,
              pendingBaselineExpiresAt: now + QUALITY_AXIS_BLOCK_MS,
              effectsRetryAt: now + QUALITY_EFFECTS_RETRY_MS,
              lastChange: {
                axis: "effects",
                direction: "down",
                reason: "pressure",
              },
            };
        }

        return next;
      }

      if (constraint === "cpu") {
        if (next.forced || blockedAxis("content")) return next;
        if (
          axisReady(
            next,
            "content",
            next.cpuSince,
            now,
            QUALITY_CONTENT_FALL_MS,
          )
        ) {
          const tier = lowerTier(SCENE_CONTENT_TIERS, next.axes.content);
          if (tier)
            return {
              ...next,
              axes: { ...next.axes, content: tier },
              axisChangedAt: moved(next, "content", now),
              pendingBaseline: metrics,
              pendingBaselineExpiresAt: now + QUALITY_AXIS_BLOCK_MS,
              lastChange: {
                axis: "content",
                direction: "down",
                reason: "pressure",
              },
            };
        }
        return next;
      }

      if (constraint === "headroom") {
        // Cinematic is manual-only, so automatic mode tops out at the tier
        // Showcase and Balanced share. Climbing into Cinematic unasked would
        // hand a capture-grade preset to a visitor who never chose it.
        const ceiling = next.forced
          ? AXES_BY_PROFILE[next.forced]
          : AXES_BY_PROFILE.showcase;

        // Climb the visible axes back before the invisible one, so a device
        // that recovered gets its geometry back rather than only its pixels.
        if (
          !next.forced &&
          axisReady(
            next,
            "content",
            next.headroomSince,
            now,
            QUALITY_CONTENT_RISE_MS,
          ) &&
          next.axes.content !== ceiling.content
        ) {
          const tier = higherTier(
            SCENE_CONTENT_TIERS,
            next.axes.content,
            ceiling.content,
          );
          if (tier)
            return {
              ...next,
              axes: { ...next.axes, content: tier },
              axisChangedAt: moved(next, "content", now),
              lastChange: {
                axis: "content",
                direction: "up",
                reason: "headroom",
              },
            };
        }

        if (
          !next.forced &&
          (next.effectsRetryAt == null || now >= next.effectsRetryAt) &&
          axisReady(
            next,
            "effects",
            next.headroomSince,
            now,
            QUALITY_EFFECTS_RISE_MS,
          ) &&
          next.axes.effects !== ceiling.effects
        ) {
          const tier = higherTier(
            SCENE_EFFECTS_TIERS,
            next.axes.effects,
            ceiling.effects,
          );
          if (tier)
            return {
              ...next,
              axes: { ...next.axes, effects: tier },
              axisChangedAt: moved(next, "effects", now),
              effectsRetryAt: null,
              lastChange: {
                axis: "effects",
                direction: "up",
                reason: "headroom",
              },
            };
        }

        if (
          allowResolutionChange &&
          (next.resolutionRetryAt == null || now >= next.resolutionRetryAt) &&
          axisReady(
            next,
            "resolution",
            next.headroomSince,
            now,
            QUALITY_RESOLUTION_RISE_MS,
          ) &&
          dwellElapsed &&
          next.axes.resolutionStep < SCENE_RESOLUTION_MAX_STEP
        ) {
          const step = next.axes.resolutionStep + 1;
          return {
            ...next,
            axes: { ...next.axes, resolutionStep: step },
            axisChangedAt: moved(next, "resolution", now),
            resolutionRetryAt: null,
            lastChange: {
              axis: "resolution",
              direction: "up",
              reason: "headroom",
            },
          };
        }
      }

      return next;
    }

    default:
      return state;
  }
}
