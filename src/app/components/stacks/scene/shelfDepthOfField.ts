import type { DepthOfFieldEffect } from "postprocessing";

import {
  GOLF_GREEN,
  GOLF_GREEN_CENTER_LOCAL,
  TRAINING_UNIT_INDEX,
} from "./golf/golfCourse";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { depthOfFieldTargetForUnit, unitPose } from "./worldLayout";

/**
 * The stock depth-of-field shader starts increasing blur immediately on both
 * sides of its target distance. This radius covers the complete shelf volume,
 * including its authored yaw and the About camera's maximum lateral shift, so
 * shelf faces and props receive exactly zero circle-of-confusion.
 */
export const SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS = 1.05;

/** Keep the old 2.2-unit distance to full blur after adding the clear band. */
export const SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE =
  2.2 - SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS;

const STOCK_DISTANCE_EXPRESSION = "abs(signedDistance)";
const SHELF_DISTANCE_EXPRESSION =
  "max(0.0, abs(signedDistance) - SHELF_FOCUS_CLEAR_RADIUS)";
// The stock ramp is one `focusRange` on both sides of the plane. Golf needs
// the near side to run much longer than the far side, so the range the
// smoothstep reads is chosen per fragment by the sign of its distance.
const STOCK_RANGE_UNIFORM = "uniform float focusRange;";
const SHELF_RANGE_UNIFORM =
  "uniform float focusRange;uniform float nearFocusRange;";
const STOCK_RANGE_EXPRESSION = "smoothstep(0.0,focusRange,";
const SHELF_RANGE_EXPRESSION =
  "smoothstep(0.0,mix(nearFocusRange,focusRange,step(0.0,signedDistance)),";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep01 = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const lerp = (from: number, to: number, weight: number) =>
  from + (to - from) * weight;
/** Interpolate two positive lengths by ratio rather than by difference.
 * Exact at both ends: the settled focus must equal the authored numbers. */
const lerpLog = (from: number, to: number, weight: number) =>
  weight <= 0 ? from : weight >= 1 ? to : from * Math.pow(to / from, weight);

/**
 * Mirror the shader's circle-of-confusion curve for deterministic tests.
 * `distanceDelta` is signed the way the shader sees it: negative means the
 * fragment sits nearer the camera than the focal plane.
 */
export function shelfDepthOfFieldBlurAmount(
  distanceDelta: number,
  farFocusRange = SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
  nearFocusRange = farFocusRange,
): number {
  const outsideClearBand = Math.max(
    0,
    Math.abs(distanceDelta) - SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
  );
  const range = distanceDelta < 0 ? nearFocusRange : farFocusRange;
  return smoothstep01(outsideClearBand / range);
}

/** The near-side ramp the patched shader reads. Created on demand so the
 * uniform exists before the program compiles against the patched source. */
function nearFocusRangeUniform(material: DepthOfFieldEffect["cocMaterial"]): {
  value: number;
} {
  const existing = material.uniforms.nearFocusRange;
  if (existing) return existing as { value: number };
  const created = { value: material.focusRange };
  material.uniforms.nearFocusRange = created;
  return created;
}

function replaceExactlyOnce(
  shader: string,
  stock: string,
  replacement: string,
): string {
  const occurrenceCount = shader.split(stock).length - 1;
  if (occurrenceCount !== 1) {
    throw new Error(
      `Unsupported postprocessing circle-of-confusion shader: expected one "${stock}"`,
    );
  }
  return shader.replace(stock, replacement);
}

/**
 * Give the installed postprocessing effect a genuine in-focus volume and a
 * separate near-side ramp. The package exposes its circle-of-confusion
 * material but neither option, so patch the shader before the first painted
 * frame.
 */
export function installShelfDepthOfFieldFocusBand(
  effect: DepthOfFieldEffect,
): void {
  const material = effect.cocMaterial;
  material.defines.SHELF_FOCUS_CLEAR_RADIUS =
    SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS.toFixed(6);
  nearFocusRangeUniform(material);

  const shader = material.fragmentShader;
  if (
    shader.includes(SHELF_DISTANCE_EXPRESSION) &&
    shader.includes(SHELF_RANGE_EXPRESSION)
  )
    return;

  let patched = replaceExactlyOnce(
    shader,
    STOCK_DISTANCE_EXPRESSION,
    SHELF_DISTANCE_EXPRESSION,
  );
  patched = replaceExactlyOnce(
    patched,
    STOCK_RANGE_UNIFORM,
    SHELF_RANGE_UNIFORM,
  );
  patched = replaceExactlyOnce(
    patched,
    STOCK_RANGE_EXPRESSION,
    SHELF_RANGE_EXPRESSION,
  );
  material.fragmentShader = patched;
  material.needsUpdate = true;
}

/**
 * Golf is the one stop that looks down a real tee-to-green axis, and a shelf
 * stop's depth of field is built for a shelf: sharp for a metre either side
 * of it and fully blurred two metres out, which buried the whole fairway,
 * the green and the flag. At the tee the sharp band ends exactly at the
 * front fringe of the green, everything nearer than that is left sharp (the
 * turf and balls at your feet, the club, the fairway), and the far side is a
 * short, hard ramp: the green goes lightly soft from its front edge to its
 * back, the tall ridge tufts that start at the green's depth and run five
 * units past it are heavily blurred, and the treeline and city beyond sit
 * at the lens's cap.
 *
 * The near side is deliberately not a lens. A thin lens focused twenty units
 * out blurs the bay at two units into a smear, and the owner wants the balls
 * he is about to click sharp. Two other cuts are on record: focusing on the
 * bay with a forty-unit far ramp blurred the fairway from the first metre
 * ("more blurred, and closer, than golf mode was"), and a near-side shaping
 * that blurred the crest grass in front of a sharp green put a pocket of
 * focus at the green with a band of blur in the middle of the fairway.
 *
 * Not exported. `shelfDepthOfField.test.ts` pins what these do to the club,
 * the fairway, the green, the ridge and the treeline from the real
 * golf-stop camera rather than reading them back.
 */
const golfPose = unitPose(TRAINING_UNIT_INDEX);
const golfCos = Math.cos(golfPose.rotation[1]);
const golfSin = Math.sin(golfPose.rotation[1]);
/** The focal plane, in the course's frame: one clear radius nearer the
 * camera than the green's front fringe, so the sharp band ends where the
 * putting surface begins. */
const golfFocusLocal = [
  GOLF_GREEN_CENTER_LOCAL[0],
  GOLF_GREEN_CENTER_LOCAL[1] +
    GOLF_GREEN.depth / 2 +
    GOLF_GREEN.fringe +
    SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
] as const;
const GOLF_DEPTH_OF_FIELD_TARGET = [
  golfPose.position[0] +
    golfFocusLocal[0] * golfCos +
    golfFocusLocal[1] * golfSin,
  SHELF_GEOMETRY.groundY,
  golfPose.position[2] -
    golfFocusLocal[0] * golfSin +
    golfFocusLocal[1] * golfCos,
] as const;
/** Nothing nearer than the plane blurs. The stock lens reads this ramp, so
 * it is far longer than the room; the optical lens reads the zero strength
 * below. */
const GOLF_DEPTH_OF_FIELD_NEAR_FALLOFF_RANGE = 240;
/** Distance past the clear band to full blur on the far side. Short: the
 * cup, three units past the band, is most of the way up it, and the back of
 * the green is at the top. */
const GOLF_DEPTH_OF_FIELD_FAR_FALLOFF_RANGE = 3.5;
/**
 * The production lens is the optical model (OpticalBokehPrototype, a thin
 * lens), whose circle of confusion is a few pixels at most for anything
 * within ten units of a plane twenty units out. The far side is boosted so
 * the ramp above is what the eye sees: the green lightly soft with its
 * pattern still readable, the ridge tufts clearly soft, the treeline and
 * city heavily blurred. Thirty-two smeared the green. The near side is
 * switched off, see above.
 */
const GOLF_DEPTH_OF_FIELD_NEAR_STRENGTH = 0;
const GOLF_DEPTH_OF_FIELD_FAR_STRENGTH = 10;

/**
 * How long the rack from the shelf to the cup takes, and back. Golf mode
 * already cuts in and out at the window's edges (the dolly, the placard,
 * the club), so the focus follows the same cue: it starts the moment the
 * window opens and refocuses over half a second, progressive rather than
 * instant, and reverses from wherever it is if the window closes mid-way.
 * An earlier cut waited for the camera to arrive and settle first; that
 * left the green blurred whenever the scroll rested short of the exact
 * stop, and the owner called the wait itself overthinking.
 */
export const GOLF_FOCUS_PULL_SECONDS = 0.5;

/** The largest frame delta the pull will integrate. A tab that was hidden
 * comes back with seconds of accumulated time; that must not finish the rack
 * in one frame. */
const GOLF_FOCUS_PULL_MAX_FRAME_SECONDS = 0.1;

/**
 * The before/after seam for the Scene console. "legacy" blends the two blur
 * ramps linearly, which sharpens the whole room a tenth of the way into the
 * rack; "current" blends them in log space so the sharp band is seen to
 * travel down the fairway. Read at call time, so flipping it mid-visit takes
 * effect on the next frame. Diagnostics only; the site ships "current".
 */
export type GolfFocusPullVariant = "current" | "legacy";
let golfFocusPullVariantValue: GolfFocusPullVariant = "current";

export function golfFocusPullVariant(): GolfFocusPullVariant {
  return golfFocusPullVariantValue;
}

export function setGolfFocusPullVariant(next: GolfFocusPullVariant) {
  golfFocusPullVariantValue = next;
}

/** What the rack decided this frame, for the console and headless runs.
 * Written by `advanceShelfDepthOfFieldPull`; read, never awaited. */
export const golfFocusPullDiagnostics = {
  golfFocused: false,
  weight: 0,
};

export type ShelfDepthOfFieldFocus = {
  /** World-space point the effect measures camera distance against. */
  target: [number, number, number];
  /** Distance past the clear band to full blur, nearer than the plane. */
  nearFocusRange: number;
  /** The same, beyond the plane. The shader's stock `focusRange`. */
  farFocusRange: number;
  /** Multipliers on the blur nearer than and beyond the plane, 1 on a
   * shelf. Read by the optical lens, whose thin-lens circle of confusion
   * cannot otherwise be shaped per side. */
  nearStrength: number;
  farStrength: number;
};

export type ShelfDepthOfFieldTuning = Readonly<{
  /** The active shelf's focal point. Where the pull rests when golf lets go. */
  target: [number, number, number];
  /** The shelf's symmetric ramp. */
  focusRange: number;
  bokehScale: number;
  resolutionScale: number;
  /** Where the golf focus pull lands, and whether it is engaged right now. */
  golf: Readonly<{ engaged: boolean } & ShelfDepthOfFieldFocus>;
}>;

/** The eased rack, owned by whichever lens is mounted and advanced from its
 * frame loop: arming, progress, the eased weight, and the focus that weight
 * resolves to. Both lenses drive the same object so the rack is one thing. */
export type ShelfDepthOfFieldPull = {
  progress: number;
  weight: number;
  focus: ShelfDepthOfFieldFocus;
};

/**
 * The single place that decides whether depth of field runs and how it is
 * tuned. Returns null when the pass must not mount at all, which is a
 * different thing from mounting it at zero strength: an unmounted pass costs
 * no render target, no texture sample, and no per-frame work.
 *
 * Three independent reasons suppress it. The quality plan drops it on the
 * cheaper effect tiers, `?nodof` isolates it for comparison, and sitting down
 * puts the camera inside the blur volume where the treatment reads as a
 * smeared foreground rather than depth.
 */
export function resolveShelfDepthOfFieldTuning({
  plan,
  activeUnit,
  golfFocused,
  seated,
  isolated = false,
}: {
  plan: Readonly<{
    depthOfField: boolean;
    depthOfFieldBokehScale: number;
    depthOfFieldResolutionScale: number;
  }>;
  activeUnit: number;
  golfFocused: boolean;
  seated: boolean;
  /** `?nodof` — the reload-time comparison switch. */
  isolated?: boolean;
}): ShelfDepthOfFieldTuning | null {
  if (!plan.depthOfField || isolated || seated) return null;
  return {
    target: [...depthOfFieldTargetForUnit(activeUnit)],
    focusRange: SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
    bokehScale: plan.depthOfFieldBokehScale,
    resolutionScale: plan.depthOfFieldResolutionScale,
    golf: {
      engaged: golfFocused,
      target: [...GOLF_DEPTH_OF_FIELD_TARGET],
      nearFocusRange: GOLF_DEPTH_OF_FIELD_NEAR_FALLOFF_RANGE,
      farFocusRange: GOLF_DEPTH_OF_FIELD_FAR_FALLOFF_RANGE,
      nearStrength: GOLF_DEPTH_OF_FIELD_NEAR_STRENGTH,
      farStrength: GOLF_DEPTH_OF_FIELD_FAR_STRENGTH,
    },
  };
}

/** A rack at rest for the tuning's current golf state: settled on the cup
 * when a visit boots at the tee, on the shelf otherwise. */
export function createShelfDepthOfFieldPull(
  tuning: Pick<ShelfDepthOfFieldTuning, "target" | "focusRange" | "golf">,
): ShelfDepthOfFieldPull {
  const settled = tuning.golf.engaged;
  return {
    progress: settled ? 1 : 0,
    weight: settled ? 1 : 0,
    focus: blendShelfDepthOfFieldFocus(tuning, settled ? 1 : 0),
  };
}

/**
 * One frame of the rack: engaged by the golf window, progress integrated
 * from real time, and the focus blended for the eased weight. Mutates and
 * returns `pull`; allocates nothing.
 */
export function advanceShelfDepthOfFieldPull(
  pull: ShelfDepthOfFieldPull,
  tuning: Pick<ShelfDepthOfFieldTuning, "target" | "focusRange" | "golf">,
  frameSeconds: number,
  /** Where the rack is heading, 0..1. Golf mode's continuous weight
   * (golfMode.ts) on the site; the engaged switch when a caller has
   * nothing finer. */
  target: number | boolean = tuning.golf.engaged,
): ShelfDepthOfFieldPull {
  pull.progress = advanceGolfFocusPull(pull.progress, target, frameSeconds);
  pull.weight = golfFocusPullWeight(pull.progress);
  blendShelfDepthOfFieldFocus(tuning, pull.weight, pull.focus);
  golfFocusPullDiagnostics.golfFocused = tuning.golf.engaged;
  golfFocusPullDiagnostics.weight = pull.weight;
  return pull;
}

/**
 * Move the pull's progress toward its target by real elapsed time, at most
 * the full rack per `pullSeconds`. Linear in time so that reversing
 * mid-rack is continuous: the plane simply turns around wherever it is.
 * The target is a switch (0 or 1) or golf mode's continuous weight, which
 * the rack then follows at its own pace. `golfFocusPullWeight` supplies
 * the easing.
 */
export function advanceGolfFocusPull(
  progress: number,
  target: number | boolean,
  frameSeconds: number,
  pullSeconds = GOLF_FOCUS_PULL_SECONDS,
): number {
  const goal = typeof target === "boolean" ? (target ? 1 : 0) : clamp01(target);
  const step =
    Math.min(GOLF_FOCUS_PULL_MAX_FRAME_SECONDS, Math.max(0, frameSeconds)) /
    pullSeconds;
  return progress < goal
    ? Math.min(goal, progress + step)
    : Math.max(goal, progress - step);
}

/** Ease-in-out over the pull, so the plane leaves the shelf gently and
 * settles onto the cup rather than snapping at either end. */
export function golfFocusPullWeight(progress: number): number {
  return smoothstep01(progress);
}

/**
 * The focus the effect should measure against at a given pull weight: the
 * shelf at 0, the cup at 1, and a straight rack down the fairway between.
 * The ramps widen with the plane in log space, not linearly: a linear blend
 * from 1.15 to 240 is already 25 at a tenth of the pull, which sharpened the
 * whole room in the first frames and left nothing for the eye to follow.
 * Geometric growth keeps a real band that is seen to travel down the
 * fairway and open out as it goes.
 */
export function blendShelfDepthOfFieldFocus(
  tuning: Pick<ShelfDepthOfFieldTuning, "target" | "focusRange" | "golf">,
  weight: number,
  out: ShelfDepthOfFieldFocus = {
    target: [0, 0, 0],
    nearFocusRange: 0,
    farFocusRange: 0,
    nearStrength: 1,
    farStrength: 1,
  },
): ShelfDepthOfFieldFocus {
  const w = clamp01(weight);
  out.target[0] = lerp(tuning.target[0], tuning.golf.target[0], w);
  out.target[1] = lerp(tuning.target[1], tuning.golf.target[1], w);
  out.target[2] = lerp(tuning.target[2], tuning.golf.target[2], w);
  const ramp = golfFocusPullVariantValue === "legacy" ? lerp : lerpLog;
  out.nearFocusRange = ramp(tuning.focusRange, tuning.golf.nearFocusRange, w);
  out.farFocusRange = ramp(tuning.focusRange, tuning.golf.farFocusRange, w);
  // Strengths are plain multipliers, so they blend linearly from a shelf's 1.
  out.nearStrength = lerp(1, tuning.golf.nearStrength, w);
  out.farStrength = lerp(1, tuning.golf.farStrength, w);
  return out;
}

/** The focus the pull ends on for the tuning's current golf state. For
 * consumers that do not animate, like the optical prototype. */
export function settledShelfDepthOfFieldFocus(
  tuning: Pick<ShelfDepthOfFieldTuning, "target" | "focusRange" | "golf">,
): ShelfDepthOfFieldFocus {
  return blendShelfDepthOfFieldFocus(tuning, tuning.golf.engaged ? 1 : 0);
}

/**
 * Push live tuning onto a mounted effect.
 *
 * The React wrapper reconstructs the whole effect whenever bokeh, focus, or
 * resolution props change, which drops a frame and re-allocates two render
 * targets every time a diagnostics slider moves. So the wrapper keeps stable
 * constructor values and the tuning arrives here instead — including the
 * blur pass, which owns a second copy of the resolution scale and is the one
 * everybody forgets.
 */
export function applyShelfDepthOfFieldTuning(
  effect: DepthOfFieldEffect,
  tuning: Omit<ShelfDepthOfFieldTuning, "target" | "golf"> & {
    nearFocusRange?: number;
  },
): void {
  installShelfDepthOfFieldFocusBand(effect);
  effect.bokehScale = tuning.bokehScale;
  applyShelfDepthOfFieldFocusRanges(effect, {
    nearFocusRange: tuning.nearFocusRange ?? tuning.focusRange,
    farFocusRange: tuning.focusRange,
  });
  effect.resolution.scale = tuning.resolutionScale;
  effect.blurPass.resolution.scale = tuning.resolutionScale;
}

/** The per-frame half of the tuning: the two ramps the pull animates. The
 * target is written by the caller, which composes the prop focus pull on
 * top of it. */
export function applyShelfDepthOfFieldFocusRanges(
  effect: DepthOfFieldEffect,
  focus: Pick<ShelfDepthOfFieldFocus, "nearFocusRange" | "farFocusRange">,
): void {
  const material = effect.cocMaterial;
  // The uniform is created in the same call that patches the shader, so its
  // absence is the cheap per-frame proof that the patch has not run yet.
  if (!material.uniforms.nearFocusRange)
    installShelfDepthOfFieldFocusBand(effect);
  material.focusRange = focus.farFocusRange;
  nearFocusRangeUniform(material).value = focus.nearFocusRange;
}
