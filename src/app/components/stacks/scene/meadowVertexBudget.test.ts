import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { meadowGrassVertexShader } from "./Meadow";
import {
  MEADOW_BRUSH_IDLE_EPSILON,
  MEADOW_BRUSH_IDLE_GRACE_SECONDS,
  meadowBrushAtRest,
  meadowBrushIdleSeconds,
  meadowSettledBrushStrength,
} from "./meadowInteraction";
import { MEADOW_POKE, MEADOW_WIND } from "./meadowMotion";

const meadow = fs.readFileSync(
  path.join(path.resolve(__dirname), "Meadow.tsx"),
  "utf8",
);
/** The GLSL the GPU actually compiles, not the template that produces it. */
const grass = meadowGrassVertexShader(false);
const deformedGrass = meadowGrassVertexShader(true);

// ---------------------------------------------------------------------------
// The CPU half. An eased brush has to land on EXACTLY zero, or the shader's
// uniform guard never closes and the expensive path is the resident one.

/** THREE.MathUtils.damp, reproduced so the settle can be tested against the
 * arithmetic the frame loop actually runs. */
const damp = (current: number, target: number, lambda: number, dt: number) =>
  target + (current - target) * Math.exp(-lambda * dt);

type Settle = (strength: number, frame: Frame) => number;
type Frame = { target: number; secondsSinceDriven: number };

/** The shipped rule. */
const shipped: Settle = (strength, frame) =>
  meadowSettledBrushStrength(strength, frame.secondsSinceDriven);
/** No settle at all: the pre-optimisation behaviour, and the reference every
 * cadence case below has to match exactly. */
const untouched: Settle = (strength) => strength;
/** The rule this file exists to keep out: settling on the per-frame target.
 * It looks right against a constant gesture and erases a real one, because
 * `target` is re-zeroed every frame and only set on frames that carried a
 * pointer sample. Between-event frames are indistinguishable from a release. */
const perFrameTargetRule: Settle = (strength, frame) =>
  frame.target > 0
    ? strength
    : strength < MEADOW_BRUSH_IDLE_EPSILON
      ? 0
      : strength;

/**
 * Drive one brush the way the frame loop does, at a real input cadence.
 *
 * `renderHz` frames a second see a pointer sample only every `eventHz`, which
 * is the ordinary desktop case: a 60Hz mouse under a 120Hz renderer carries a
 * target on every other frame and zero on the rest.
 */
function driveCadence({
  target,
  seconds,
  attack,
  release,
  settle,
  renderHz = 120,
  eventHz = 60,
  from = 0,
  driving = true,
  clockResetsAtFrame = -1,
}: {
  target: number;
  seconds: number;
  attack: number;
  release: number;
  settle: Settle;
  renderHz?: number;
  eventHz?: number;
  from?: number;
  driving?: boolean;
  /** Frame at which the scene clock restarts from zero, as R3F does on a
   * frameloop change. -1 never. */
  clockResetsAtFrame?: number;
}) {
  const dt = 1 / renderHz;
  const framesPerEvent = Math.max(1, Math.round(renderHz / eventHz));
  let strength = from;
  // The frame loop's own bookkeeping, reproduced rather than approximated:
  // a scene clock, a stamp, and the shipped age function between them.
  let now = 0;
  let lastDrivenAt = Number.NEGATIVE_INFINITY;
  const frames = Math.round(seconds * renderHz);
  for (let frame = 0; frame < frames; frame += 1) {
    now = frame === clockResetsAtFrame ? 0 : now + dt;
    const sampled = driving && frame % framesPerEvent === 0;
    const frameTarget = sampled ? target : 0;
    if (frameTarget > 0) lastDrivenAt = now;
    const secondsSinceDriven = meadowBrushIdleSeconds(now, lastDrivenAt);
    strength = damp(
      strength,
      frameTarget,
      frameTarget > strength ? attack : release,
      dt,
    );
    strength = settle(strength, { target: frameTarget, secondsSinceDriven });
  }
  return strength;
}

const GRASS = {
  attack: MEADOW_POKE.grassAttackLambda,
  release: MEADOW_POKE.grassReleaseLambda,
};
const FLOWERS = {
  attack: MEADOW_POKE.flowerAttackLambda,
  release: MEADOW_POKE.flowerReleaseLambda,
};

describe("meadow brush settles only when the gesture is actually idle", () => {
  it("survives a 60Hz pointer sampled by a 120Hz renderer", () => {
    // A 60Hz mouse carries a target on every other 120Hz frame. The frames
    // between samples are not a released gesture, and a settle that cannot
    // tell them apart pins a slow drag at zero forever.
    for (const [name, lambdas, target, expected] of [
      ["grass", GRASS, 0.006, 0.004758207887098018],
      ["flowers", FLOWERS, 0.02, 0.01472808580747906],
    ] as const) {
      const options = { target, seconds: 10, ...lambdas };
      const reference = driveCadence({ ...options, settle: untouched });
      expect(reference, name).toBeCloseTo(expected, 9);
      // The shipped rule must not change a single frame of a live gesture.
      expect(driveCadence({ ...options, settle: shipped }), name).toBe(
        reference,
      );
      // The rule it replaced erased the whole gesture.
      expect(
        driveCadence({ ...options, settle: perFrameTargetRule }),
        name,
      ).toBe(0);
    }
  });

  it("survives the same alternating cadence at 240Hz", () => {
    // The same one-empty-frame-per-sample pattern on a 240Hz panel. Halving
    // the step does not rescue it: the mistake is the rule, not the rate.
    for (const [name, lambdas, target, expected] of [
      ["grass", GRASS, 0.006, 0.00479314147551035],
      ["flowers", FLOWERS, 0.02, 0.014771527271524665],
    ] as const) {
      const options = {
        target,
        seconds: 10,
        renderHz: 240,
        eventHz: 120,
        ...lambdas,
      };
      const reference = driveCadence({ ...options, settle: untouched });
      expect(reference, name).toBeCloseTo(expected, 9);
      expect(driveCadence({ ...options, settle: shipped }), name).toBe(
        reference,
      );
      expect(
        driveCadence({ ...options, settle: perFrameTargetRule }),
        name,
      ).toBe(0);
    }
  });

  it("survives a pointer slow enough to skip many frames", () => {
    // A 15Hz sample rate is well outside anything a healthy pointer produces
    // and still inside the grace window, so the headroom is real rather than
    // tuned to the two cadences above.
    const options = { target: 0.006, seconds: 10, eventHz: 15, ...GRASS };
    expect(driveCadence({ ...options, settle: shipped })).toBe(
      driveCadence({ ...options, settle: untouched }),
    );
  });

  it("still collapses a released brush to exactly zero", () => {
    const released = driveCadence({
      target: 0,
      seconds: 4,
      driving: false,
      from: MEADOW_POKE.hoverStrength,
      settle: shipped,
      ...GRASS,
    });
    expect(Object.is(released, 0)).toBe(true);
    // Without any settle the same decay is still nonzero after a full minute,
    // which is why the settle exists: the shader's uniform guard would never
    // close and the expensive path would be the resident one.
    const bare = driveCadence({
      target: 0,
      seconds: 60,
      driving: false,
      from: MEADOW_POKE.hoverStrength,
      settle: untouched,
      ...GRASS,
    });
    expect(bare).toBeGreaterThan(0);
  });

  it("bounds what the grace window costs rather than claiming it is free", () => {
    // Released from full hover strength the window adds nothing: the decay
    // needs far longer than 250ms to reach the epsilon by itself.
    const toEpsilon =
      Math.log(MEADOW_POKE.hoverStrength / MEADOW_BRUSH_IDLE_EPSILON) /
      MEADOW_POKE.grassReleaseLambda;
    expect(MEADOW_BRUSH_IDLE_GRACE_SECONDS).toBeLessThan(toEpsilon / 4);
    // The case that does cost is a brush released while ALREADY under the
    // epsilon — a very light touch. It keeps the shader's interaction block
    // open for the width of the window and no longer.
    expect(
      meadowSettledBrushStrength(
        MEADOW_BRUSH_IDLE_EPSILON / 2,
        MEADOW_BRUSH_IDLE_GRACE_SECONDS - 1e-9,
      ),
    ).toBeGreaterThan(0);
    expect(
      meadowSettledBrushStrength(
        MEADOW_BRUSH_IDLE_EPSILON / 2,
        MEADOW_BRUSH_IDLE_GRACE_SECONDS,
      ),
    ).toBe(0);
    // And the window covers every cadence driven above, without claiming to
    // bound every input gap a browser can produce.
    expect(MEADOW_BRUSH_IDLE_GRACE_SECONDS).toBeGreaterThan(10 / 60);
  });

  it("clips only until the next sample when the clock restarts mid-gesture", () => {
    // The documented limit of reading idle from a clock that can restart. If
    // R3F resets elapsedTime while a gesture is live, the frames between the
    // reset and the next pointer sample read as idle, so a ramp still under
    // the epsilon is clipped. It recovers by itself: the next sample restamps
    // against the new clock and the drive continues.
    //
    // There is no known production path to it — sceneClock.ts restores the
    // value, and a frameloop change interrupts the gesture anyway — so this
    // records the behaviour rather than asserting it is unreachable.
    const options = { target: 0.006, seconds: 10, ...GRASS };
    const undisturbed = driveCadence({ ...options, settle: shipped });
    const disturbed = driveCadence({
      ...options,
      settle: shipped,
      clockResetsAtFrame: 600,
    });
    // Clipped, not erased, and back on the same trajectory long before the
    // end of the gesture.
    expect(disturbed).toBeCloseTo(undisturbed, 6);
    // And a reset in the last frames, with no sample after it to recover on,
    // costs at most the sub-epsilon tail.
    const atTheEnd = driveCadence({
      ...options,
      settle: shipped,
      clockResetsAtFrame: 1199,
    });
    expect(Math.abs(atTheEnd - undisturbed)).toBeLessThan(
      MEADOW_BRUSH_IDLE_EPSILON,
    );
  });

  it("reads idle when the scene clock restarts under it", () => {
    // R3F resets clock.elapsedTime on a frameloop change and sceneClock.ts
    // puts it back — a wrapper, so something that can be bypassed. A stamp
    // left in the future would otherwise disarm the settle for the rest of
    // the visit with nothing to show for it.
    expect(meadowBrushIdleSeconds(12, 4)).toBe(8);
    expect(meadowBrushIdleSeconds(4, 4)).toBe(0);
    expect(meadowBrushIdleSeconds(0, 30)).toBe(Number.POSITIVE_INFINITY);
    expect(meadowBrushIdleSeconds(0, Number.NEGATIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY,
    );
    // A clock that jumped FORWARD — a hidden tab, a long stall — reads as a
    // long idle, which is the reading that arms the settle rather than
    // stranding it.
    expect(meadowBrushIdleSeconds(300, 4)).toBe(296);
    expect(
      meadowSettledBrushStrength(1e-6, meadowBrushIdleSeconds(300, 4)),
    ).toBe(0);
    // And the settle is armed by that reading rather than stuck open.
    expect(meadowSettledBrushStrength(1e-6, meadowBrushIdleSeconds(0, 30))).toBe(
      0,
    );
  });

  it("never alters a brush inside the grace window", () => {
    expect(meadowSettledBrushStrength(1e-9, 0)).toBe(1e-9);
    expect(
      meadowSettledBrushStrength(1e-9, MEADOW_BRUSH_IDLE_GRACE_SECONDS / 2),
    ).toBe(1e-9);
    expect(
      meadowSettledBrushStrength(1e-9, MEADOW_BRUSH_IDLE_GRACE_SECONDS),
    ).toBe(0);
    expect(
      meadowSettledBrushStrength(0.5, Number.POSITIVE_INFINITY),
    ).toBe(0.5);
  });

  it("keeps the complete collapsed lean far below one authored throw", () => {
    // Both terms, not just the direct one. `uPokeDir * push` is bounded by
    // the epsilon; the wind suppression is bounded by
    // windSuppression * (epsilon / hoverStrength) * the gust ceiling, and it
    // is roughly four times larger.
    const direct = MEADOW_BRUSH_IDLE_EPSILON;
    const suppression =
      MEADOW_POKE.windSuppression *
      (MEADOW_BRUSH_IDLE_EPSILON / MEADOW_POKE.hoverStrength) *
      MEADOW_WIND.gustCeiling;
    expect(suppression).toBeGreaterThan(direct);
    expect((direct + suppression) / MEADOW_WIND.authoredMaxLean).toBeLessThan(
      0.015,
    );
  });

  it("reports rest only when no pulse slot and no brush carries strength", () => {
    expect(meadowBrushAtRest(0, [0, 0, 0, 0, 0, 0])).toBe(true);
    expect(meadowBrushAtRest(0.2, [0, 0, 0, 0, 0, 0])).toBe(false);
    expect(meadowBrushAtRest(0, [0, 0, 0.01, 0, 0, 0])).toBe(false);
    expect(meadowBrushAtRest(0, [])).toBe(true);
  });

  it("settles against time since the gesture, not against one frame's target", () => {
    expect(meadow).toContain("let brushTarget = 0;");
    expect(meadow).toContain("lastBrushDriveAt.current = clock.elapsedTime;");
    expect(meadow).toContain(
      "const secondsSinceBrushDriven = meadowBrushIdleSeconds(\n      clock.elapsedTime,\n      lastBrushDriveAt.current,\n    );",
    );
    expect(meadow).toContain(
      "shared.uPoke.value.w = meadowSettledBrushStrength(\n      shared.uPoke.value.w,\n      secondsSinceBrushDriven,\n    );",
    );
    expect(meadow).toContain(
      "shared.uPokeF.value.w = meadowSettledBrushStrength(\n      shared.uPokeF.value.w,\n      secondsSinceBrushDriven,\n    );",
    );
    expect(meadow).toMatch(
      /MEADOW_POKE\.flowerReleaseLambda,\s*\n\s*delta,\s*\n\s*\);\s*\n\s*brushTarget = target;/,
    );
    // The frame loop's own "is a gesture still animating" test and the
    // shader's guard have to read the same threshold.
    expect(meadow).toContain("uPoke.value.w > MEADOW_BRUSH_IDLE_EPSILON");
    expect(meadow).toContain("uPokeF.value.w > MEADOW_BRUSH_IDLE_EPSILON");
    expect(meadow).toContain("shared.uPulseActive.value =");
  });
});

// ---------------------------------------------------------------------------
// The GPU half. Every guarded term below depends only on `origin`, so it is
// per-INSTANCE work paid per VERTEX — 132 times over for the near tuft LOD.
// The guards are uniform-valued, so a warp never diverges on them.

describe("grass vertex shader skips idle per-instance simulation", () => {
  it("gates the whole pulse ring loop on one live-pulse uniform", () => {
    for (const source of [grass, deformedGrass]) {
      expect(source).toContain("uniform float uPulseActive;");
      expect(source).toContain("if (uPulseActive > 0.0) {");
      expect(source).toContain("if (pulse.w <= 0.0) continue;");
    }
  });

  it("skips the pointer brush shape while no brush is live", () => {
    expect(grass).toContain("if (uPoke.w > 0.0) {");
    expect(deformedGrass).toContain("if (uPoke.w > 0.0) {");
  });

  it("skips a dark lamp slot in the shared analytic pool", () => {
    expect(grass).toContain("if (uLampGlow[i] <= 0.0) continue;");
  });

  it("declares every guarded term before its guard and consumes it after", () => {
    // A guard that leaves a term undeclared is the one way this optimisation
    // can change a pixel. Each interaction term must have a zero default
    // ahead of the branch, and the lean must be assembled outside it.
    const declare = grass.indexOf("float pokeShape = 0.0;");
    const guard = grass.indexOf("if (uPoke.w > 0.0) {");
    const consume = grass.indexOf("vec2 lean = w * (1.0 - 0.82");
    expect(declare).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(declare);
    expect(consume).toBeGreaterThan(guard);
    expect(grass).toContain("float push = 0.0;");
    expect(grass).toContain("float pokeActivity = 0.0;");
    expect(grass).toContain("vec2 pulseLean = vec2(0.0);");
    expect(grass).toContain("float pulseActivity = 0.0;");
    expect(grass).toContain("+ uPokeDir * push");
    expect(grass).toContain("+ pulseLean;");
    expect(grass).toContain(
      "float interactionShape = max(\n      pokeShape * pokeActivity,\n      pulseActivity\n    );",
    );
  });

  it("leaves the far lawn's simplified path alone", () => {
    // FAR_SIMPLE never had an interaction block; guarding must not add one.
    const farBranch = grass.slice(
      grass.indexOf("#ifdef FAR_SIMPLE"),
      grass.indexOf("#else"),
    );
    expect(farBranch).toContain("vec2 lean = w;");
    expect(farBranch).not.toContain("uPulseActive");
  });
});
