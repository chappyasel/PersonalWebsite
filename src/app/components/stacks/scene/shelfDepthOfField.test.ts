import { GOLF_STOP_POSITION } from "../data";
import { DepthOfFieldEffect } from "postprocessing";
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import {
  GOLF_COURSE_CENTER,
  GOLF_CUP_WORLD_CENTER,
  GOLF_GREEN,
  TRAINING_UNIT_INDEX,
} from "./golf/golfCourse";
import { GOLF_BALL_STARTS, GOLF_CLUB_REST_BASE } from "./golf/golfLayout";
import {
  GOLF_FOCUS_PULL_SECONDS,
  SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
  SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
  advanceGolfFocusPull,
  advanceShelfDepthOfFieldPull,
  applyShelfDepthOfFieldFocusRanges,
  applyShelfDepthOfFieldTuning,
  blendShelfDepthOfFieldFocus,
  createShelfDepthOfFieldPull,
  golfFocusPullVariant,
  golfFocusPullWeight,
  installShelfDepthOfFieldFocusBand,
  resolveShelfDepthOfFieldTuning,
  setGolfFocusPullVariant,
  settledShelfDepthOfFieldFocus,
  shelfDepthOfFieldBlurAmount,
} from "./shelfDepthOfField";
import { SHELF_PLANKS } from "./shelfGeometry";
import {
  ABOUT_STOP_MAX_SHIFT,
  CAMERA,
  RAIL_RIGHT_PX_FALLBACK,
  UNIT_SPACING,
  cameraCompositionForViewport,
  depthOfFieldTargetForUnit,
  golfDollyForViewport,
  unitPose,
} from "./worldLayout";

const distance = (
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) => Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

describe("shelf depth-of-field focus band", () => {
  it("holds zero blur through the shelf before beginning the background ramp", () => {
    expect(shelfDepthOfFieldBlurAmount(0)).toBe(0);
    expect(shelfDepthOfFieldBlurAmount(SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS)).toBe(
      0,
    );
    expect(
      shelfDepthOfFieldBlurAmount(SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS + 0.01),
    ).toBeGreaterThan(0);
    expect(
      shelfDepthOfFieldBlurAmount(
        SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS + SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
      ),
    ).toBe(1);
  });

  it("covers every physical plank corner at each authored shelf angle", () => {
    let largestDistanceDelta = 0;

    for (let unit = 0; unit < 7; unit += 1) {
      const pose = unitPose(unit);
      const focusTarget = depthOfFieldTargetForUnit(unit);
      // About can shift two units right to clear the desktop rail. Test both
      // extremes because the DoF surface is radial around the live camera.
      const cameraShifts = unit === 0 ? [0, ABOUT_STOP_MAX_SHIFT] : [0];
      for (const cameraShift of cameraShifts) {
        const camera = [
          pose.position[0] + cameraShift,
          CAMERA.y,
          pose.position[2] + CAMERA.z,
        ] as const;
        const focusDistance = distance(camera, focusTarget);
        const cosine = Math.cos(pose.rotation[1]);
        const sine = Math.sin(pose.rotation[1]);

        for (const plank of SHELF_PLANKS) {
          for (const localX of [-plank.width / 2, plank.width / 2]) {
            for (const localY of [
              plank.centerY - plank.thickness / 2,
              plank.centerY + plank.thickness / 2,
            ]) {
              for (const localZ of [
                plank.centerZ - plank.depth / 2,
                plank.centerZ + plank.depth / 2,
              ]) {
                const corner = [
                  pose.position[0] + localX * cosine + localZ * sine,
                  localY,
                  pose.position[2] - localX * sine + localZ * cosine,
                ] as const;
                largestDistanceDelta = Math.max(
                  largestDistanceDelta,
                  Math.abs(distance(camera, corner) - focusDistance),
                );
              }
            }
          }
        }
      }
    }

    expect(largestDistanceDelta).toBeLessThan(
      SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
    );
    expect(
      SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS - largestDistanceDelta,
    ).toBeGreaterThan(0.15);
  });

  it("patches the real circle-of-confusion material exactly once", () => {
    const effect = new DepthOfFieldEffect(new PerspectiveCamera());

    installShelfDepthOfFieldFocusBand(effect);
    const once = effect.cocMaterial.fragmentShader;
    installShelfDepthOfFieldFocusBand(effect);

    expect(effect.cocMaterial.fragmentShader).toBe(once);
    expect(once).toContain(
      "max(0.0, abs(signedDistance) - SHELF_FOCUS_CLEAR_RADIUS)",
    );
    expect(effect.cocMaterial.defines.SHELF_FOCUS_CLEAR_RADIUS).toBe(
      SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS.toFixed(6),
    );
    effect.dispose();
  });

  it("gives the near side of the plane its own ramp in the real shader", () => {
    const effect = new DepthOfFieldEffect(new PerspectiveCamera());

    installShelfDepthOfFieldFocusBand(effect);
    const shader = effect.cocMaterial.fragmentShader;

    expect(shader).toContain("uniform float nearFocusRange;");
    expect(shader).toContain(
      "smoothstep(0.0,mix(nearFocusRange,focusRange,step(0.0,signedDistance)),",
    );
    // The stock symmetric ramp must be gone, not duplicated.
    expect(shader).not.toContain("smoothstep(0.0,focusRange,");
    // Until a caller says otherwise the two sides agree, as they always did.
    expect(effect.cocMaterial.uniforms.nearFocusRange?.value).toBe(
      effect.cocMaterial.focusRange,
    );
    effect.dispose();
  });

  it("mirrors the patched shader's asymmetric ramps", () => {
    // Nearer than the plane reads the near range; beyond it the far range.
    expect(shelfDepthOfFieldBlurAmount(-3, 10, 60)).toBeCloseTo(
      shelfDepthOfFieldBlurAmount(3, 60, 10),
      12,
    );
    expect(shelfDepthOfFieldBlurAmount(-3, 10, 60)).toBeLessThan(
      shelfDepthOfFieldBlurAmount(3, 10, 60),
    );
    expect(shelfDepthOfFieldBlurAmount(3, 10)).toBe(
      shelfDepthOfFieldBlurAmount(-3, 10),
    );
  });
});

const CINEMATIC_DOF = {
  depthOfField: true,
  depthOfFieldBokehScale: 2.4,
  depthOfFieldResolutionScale: 0.75,
} as const;

describe("shelf depth-of-field tuning", () => {
  it("follows the active shelf into world space", () => {
    for (const unit of [0, 3, 6]) {
      expect(
        resolveShelfDepthOfFieldTuning({
          plan: CINEMATIC_DOF,
          activeUnit: unit,
          golfFocused: false,
          seated: false,
        })?.target,
      ).toEqual([...depthOfFieldTargetForUnit(unit)]);
    }
  });

  it("carries the plan's bokeh and resolution scales through unchanged", () => {
    expect(
      resolveShelfDepthOfFieldTuning({
        plan: CINEMATIC_DOF,
        activeUnit: 0,
        golfFocused: false,
        seated: false,
      }),
    ).toMatchObject({
      bokehScale: CINEMATIC_DOF.depthOfFieldBokehScale,
      resolutionScale: CINEMATIC_DOF.depthOfFieldResolutionScale,
      focusRange: SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
    });
  });

  it("reports whether the golf pull is engaged and where it lands", () => {
    const shelf = resolveShelfDepthOfFieldTuning({
      plan: CINEMATIC_DOF,
      activeUnit: TRAINING_UNIT_INDEX,
      golfFocused: false,
      seated: false,
    });
    const golf = resolveShelfDepthOfFieldTuning({
      plan: CINEMATIC_DOF,
      activeUnit: TRAINING_UNIT_INDEX,
      golfFocused: true,
      seated: false,
    });

    expect(shelf?.golf.engaged).toBe(false);
    expect(golf?.golf.engaged).toBe(true);
    // The shelf's own focus is the same either way; only the pull's state
    // differs, so a wrapper can ease between the two rather than snap.
    expect(golf?.target).toEqual(shelf?.target);
    expect(golf?.focusRange).toBe(shelf?.focusRange);
    // The plane lands on the approach, a few units short of the cup, well
    // beyond the shelf.
    const camera = golfStopCamera();
    const toPlane = distance(camera, golf!.golf.target);
    expect(toPlane).toBeGreaterThan(distance(camera, golf!.target) + 10);
    const shortOfCup = Math.hypot(
      golf!.golf.target[0] - GOLF_CUP_WORLD_CENTER.x,
      golf!.golf.target[2] - GOLF_CUP_WORLD_CENTER.z,
    );
    expect(shortOfCup).toBeGreaterThan(3);
    expect(shortOfCup).toBeLessThan(4.5);
    expect(settledShelfDepthOfFieldFocus(golf!).target).toEqual(
      golf?.golf.target,
    );
    expect(settledShelfDepthOfFieldFocus(shelf!).target).toEqual(shelf?.target);
  });

  it.each([
    ["the plan drops the pass", { ...CINEMATIC_DOF, depthOfField: false }, {}],
    ["the camera is seated", CINEMATIC_DOF, { seated: true }],
    ["?nodof isolates it", CINEMATIC_DOF, { isolated: true }],
  ])("mounts nothing when %s", (_reason, plan, overrides) => {
    expect(
      resolveShelfDepthOfFieldTuning({
        plan,
        activeUnit: 0,
        golfFocused: false,
        seated: false,
        ...overrides,
      }),
    ).toBeNull();
  });

  it("pushes live tuning onto both resolution owners of a mounted effect", () => {
    const effect = new DepthOfFieldEffect(new PerspectiveCamera());

    applyShelfDepthOfFieldTuning(effect, {
      focusRange: 3.5,
      bokehScale: 2.4,
      resolutionScale: 0.6,
    });

    expect(effect.bokehScale).toBe(2.4);
    expect(effect.cocMaterial.focusRange).toBe(3.5);
    expect(effect.resolution.scale).toBe(0.6);
    // The blur pass owns a second copy of the scale and is the one that gets
    // forgotten; a mismatch there renders the bokeh at the wrong size.
    expect(effect.blurPass.resolution.scale).toBe(0.6);
    // Live tuning must not lose the clear band the shelf depends on.
    expect(effect.cocMaterial.fragmentShader).toContain(
      "SHELF_FOCUS_CLEAR_RADIUS",
    );
    effect.dispose();
  });
});

/** The desktop golf-stop camera, built the way CameraRig builds it: the
 * scene position along the aisle, the stop's framing, and the golf dolly. */
function golfStopCamera() {
  const composition = cameraCompositionForViewport(
    1440,
    900,
    GOLF_STOP_POSITION,
    RAIL_RIGHT_PX_FALLBACK,
  );
  return [
    GOLF_STOP_POSITION * UNIT_SPACING + composition.lateralOffset,
    composition.y,
    composition.z - golfDollyForViewport(1440, true),
  ] as const;
}

function trainingWorldPoint(x: number, y: number, z: number) {
  const pose = unitPose(TRAINING_UNIT_INDEX);
  const cosine = Math.cos(pose.rotation[1]);
  const sine = Math.sin(pose.rotation[1]);
  return [
    pose.position[0] + x * cosine + z * sine,
    y,
    pose.position[2] - x * sine + z * cosine,
  ] as const;
}

describe("golf focus pull", () => {
  const tuning = resolveShelfDepthOfFieldTuning({
    plan: CINEMATIC_DOF,
    activeUnit: TRAINING_UNIT_INDEX,
    golfFocused: true,
    seated: false,
  })!;
  const camera = golfStopCamera();
  const blurAt = (point: readonly [number, number, number], weight: number) => {
    const focus = blendShelfDepthOfFieldFocus(tuning, weight);
    return shelfDepthOfFieldBlurAmount(
      distance(camera, point) - distance(camera, focus.target),
      focus.farFocusRange,
      focus.nearFocusRange,
    );
  };
  const cup = [
    GOLF_CUP_WORLD_CENTER.x,
    tuning.golf.target[1],
    GOLF_CUP_WORLD_CENTER.z,
  ] as const;
  const halfGreen = GOLF_GREEN.depth / 2 + GOLF_GREEN.fringe;
  const yaw = GOLF_COURSE_CENTER.yaw;
  const greenNear = [
    GOLF_COURSE_CENTER.x + halfGreen * Math.sin(yaw),
    cup[1],
    GOLF_COURSE_CENTER.z + halfGreen * Math.cos(yaw),
  ] as const;
  const greenFar = [
    GOLF_COURSE_CENTER.x - halfGreen * Math.sin(yaw),
    cup[1],
    GOLF_COURSE_CENTER.z - halfGreen * Math.cos(yaw),
  ] as const;
  const clubGrip = trainingWorldPoint(
    GOLF_CLUB_REST_BASE.x,
    GOLF_CLUB_REST_BASE.y + 1.8,
    GOLF_CLUB_REST_BASE.z,
  );
  const teedBall = trainingWorldPoint(
    GOLF_BALL_STARTS.one.x,
    GOLF_BALL_STARTS.one.y,
    GOLF_BALL_STARTS.one.z,
  );
  const treeline = trainingWorldPoint(-1.55, 0, -30);

  it("is needed: the shelf focus blurs the cup completely", () => {
    // Why the plane racks at all. The cup is about seventeen units past the
    // shelf plane, and the old widened-but-unmoved ramp never reached it.
    expect(
      distance(camera, cup) - distance(camera, tuning.target),
    ).toBeGreaterThan(16);
    expect(blurAt(cup, 0)).toBe(1);
    expect(blurAt(greenNear, 0)).toBe(1);
  });

  it("lands sharp up to the green's front fringe and ramps hard behind it", () => {
    // Nothing nearer than the plane blurs: the balls, the club, the shelf,
    // the fairway, and the crest grass just short of the green. The stock
    // lens's near ramp is longer than the room, so these round to zero;
    // the optical lens's near strength is exactly zero.
    const fairway = trainingWorldPoint(-1.55, -0.9, -8);
    const crestGrass = trainingWorldPoint(-1.55, -0.9, -12);
    for (const point of [teedBall, clubGrip, tuning.target, fairway, crestGrass])
      expect(blurAt(point, 1)).toBeLessThan(0.02);
    expect(tuning.golf.nearStrength).toBe(0);
    // The sharp band ends at the green's front fringe.
    expect(blurAt(greenNear, 1)).toBe(0);
    // Then a short, hard ramp across the green: the cup most of the way up
    // it, the back edge at the top.
    expect(blurAt(cup, 1)).toBeGreaterThan(0.5);
    expect(blurAt(cup, 1)).toBeLessThan(1);
    expect(blurAt(greenFar, 1)).toBeGreaterThan(blurAt(cup, 1));
    expect(blurAt(greenFar, 1)).toBeGreaterThan(0.95);
    // The ridge tufts behind the green, the treeline and the city: full.
    expect(blurAt(trainingWorldPoint(-1.55, -0.6, -22.8), 1)).toBe(1);
    expect(blurAt(treeline, 1)).toBe(1);
    expect(blurAt(trainingWorldPoint(-1.55, 0, -60), 1)).toBe(1);
    // Never a pocket: from the plane outward, no point is sharper than one
    // nearer it.
    let previous = 0;
    for (let d = 0; d <= 40; d += 0.5) {
      const blur = blurAt(trainingWorldPoint(-1.55, -0.9, -14 - d), 1);
      expect(blur).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = blur;
    }
  });

  it("opens the far ramp progressively rather than snapping it", () => {
    // Half way through the rack the plane is half way down the fairway and
    // the ramps have opened by ratio, so the crest and the green are still
    // fully blurred; they clear only as the rack completes, which is the
    // change the eye follows.
    const crestGrass = trainingWorldPoint(-1.55, -0.9, -12);
    const focus = blendShelfDepthOfFieldFocus(tuning, 0.5);
    expect(focus.farFocusRange).toBeCloseTo(
      Math.sqrt(tuning.focusRange * tuning.golf.farFocusRange),
      9,
    );
    expect(focus.nearFocusRange).toBeCloseTo(
      Math.sqrt(tuning.focusRange * tuning.golf.nearFocusRange),
      9,
    );
    expect(blurAt(crestGrass, 0.5)).toBe(1);
    expect(blurAt(cup, 0.5)).toBe(1);
    expect(blurAt(cup, 0.8)).toBeGreaterThan(blurAt(cup, 1));
    // Endpoints are exactly the shelf and the tee profile.
    expect(blendShelfDepthOfFieldFocus(tuning, 0)).toEqual({
      target: tuning.target,
      nearFocusRange: tuning.focusRange,
      farFocusRange: tuning.focusRange,
      nearStrength: 1,
      farStrength: 1,
    });
    expect(blendShelfDepthOfFieldFocus(tuning, 1)).toEqual({
      target: tuning.golf.target,
      nearFocusRange: tuning.golf.nearFocusRange,
      farFocusRange: tuning.golf.farFocusRange,
      nearStrength: tuning.golf.nearStrength,
      farStrength: tuning.golf.farStrength,
    });
  });

  it("writes into a caller's scratch so the frame loop allocates nothing", () => {
    const scratch = {
      target: [0, 0, 0] as [number, number, number],
      nearFocusRange: 0,
      farFocusRange: 0,
      nearStrength: 1,
      farStrength: 1,
    };
    expect(blendShelfDepthOfFieldFocus(tuning, 1, scratch)).toBe(scratch);
    expect(scratch.target).toEqual(tuning.golf.target);
  });

  it("takes the authored time to rack at any frame rate, and reverses in place", () => {
    const framesAt = (hz: number) => {
      let progress = 0;
      let frames = 0;
      while (progress < 1) {
        progress = advanceGolfFocusPull(progress, true, 1 / hz);
        frames += 1;
      }
      return frames / hz;
    };
    expect(framesAt(60)).toBeCloseTo(GOLF_FOCUS_PULL_SECONDS, 1);
    expect(framesAt(120)).toBeCloseTo(GOLF_FOCUS_PULL_SECONDS, 1);

    // Leaving the golf window mid-rack turns the plane around where it is.
    const halfway = advanceGolfFocusPull(0, true, GOLF_FOCUS_PULL_SECONDS / 2);
    expect(halfway).toBeCloseTo(0.2, 2); // one clamped frame, not half the pull
    let progress = 0;
    for (let i = 0; i < 15; i += 1)
      progress = advanceGolfFocusPull(progress, true, 1 / 60);
    expect(progress).toBeCloseTo(0.5, 1);
    const reversed = advanceGolfFocusPull(progress, false, 1 / 60);
    expect(reversed).toBeLessThan(progress);
    expect(reversed).toBeGreaterThan(progress - 0.04);

    // A tab that was hidden for a while does not finish the rack in one frame.
    expect(advanceGolfFocusPull(0, true, 30)).toBeLessThan(0.25);
    expect(advanceGolfFocusPull(0.5, true, -1)).toBe(0.5);
  });

  it("follows a continuous target at the rack's own pace", () => {
    // Golf mode hands the rack a weight, not a switch: the plane goes to
    // where the weight says and no faster than the full rack takes.
    let progress = 0;
    let frames = 0;
    while (progress < 0.6) {
      progress = advanceGolfFocusPull(progress, 0.6, 1 / 60);
      frames += 1;
    }
    expect(progress).toBe(0.6);
    expect(frames / 60).toBeCloseTo(GOLF_FOCUS_PULL_SECONDS * 0.6, 1);
    expect(advanceGolfFocusPull(0.6, 0.6, 1 / 60)).toBe(0.6);
    expect(advanceGolfFocusPull(1, 0.4, 1 / 60)).toBeLessThan(1);
    expect(advanceGolfFocusPull(0.41, 0.4, 1 / 60)).toBe(0.4);
    // Out-of-range targets clamp; the switch still works.
    expect(advanceGolfFocusPull(0.5, 7, 1 / 60)).toBeGreaterThan(0.5);
    expect(advanceGolfFocusPull(0.5, -1, 1 / 60)).toBeLessThan(0.5);
    expect(advanceGolfFocusPull(0, true, 1 / 60)).toBeGreaterThan(0);

    const shelf = { ...tuning, golf: { ...tuning.golf, engaged: false } };
    const pull = createShelfDepthOfFieldPull(shelf);
    for (let i = 0; i < 60; i += 1)
      advanceShelfDepthOfFieldPull(pull, shelf, 1 / 60, 0.5);
    expect(pull.progress).toBe(0.5);
    expect(pull.weight).toBeCloseTo(golfFocusPullWeight(0.5), 12);
    expect(pull.focus.target[2]).not.toBe(shelf.target[2]);
  });

  it("offers the first cut back as a console comparison, and only there", () => {
    setGolfFocusPullVariant("legacy");
    try {
      // The old linear blend opens the far ramp far earlier in the rack.
      const legacyHalf = blendShelfDepthOfFieldFocus(tuning, 0.5);
      expect(legacyHalf.farFocusRange).toBeCloseTo(
        (tuning.focusRange + tuning.golf.farFocusRange) / 2,
        9,
      );
      setGolfFocusPullVariant("current");
      const currentHalf = blendShelfDepthOfFieldFocus(tuning, 0.5);
      expect(legacyHalf.nearFocusRange).toBeGreaterThan(
        currentHalf.nearFocusRange * 2,
      );
    } finally {
      setGolfFocusPullVariant("current");
    }
    expect(golfFocusPullVariant()).toBe("current");
  });

  it("switches the optical lens's near side off and boosts its far side", () => {
    // A thin lens focused twenty units out would smear the bay; the near
    // strength is zero so the balls stay clickable. Beyond the plane its
    // circle of confusion is a few pixels at most, so the far side is
    // boosted hard. Both blend linearly in the weight.
    expect(tuning.golf.nearStrength).toBe(0);
    expect(tuning.golf.farStrength).toBeGreaterThanOrEqual(8);
    expect(tuning.golf.farStrength).toBeLessThanOrEqual(12);
    const half = blendShelfDepthOfFieldFocus(tuning, 0.5);
    expect(half.nearStrength).toBeCloseTo(0.5, 10);
    expect(half.farStrength).toBeCloseTo((1 + tuning.golf.farStrength) / 2, 10);
    // A short far ramp and a near ramp longer than the room.
    expect(tuning.golf.farFocusRange).toBeLessThan(6);
    expect(tuning.golf.nearFocusRange).toBeGreaterThan(100);
  });

  it("runs the whole rack as one object either lens can drive", () => {
    const pull = createShelfDepthOfFieldPull(tuning);
    // A boot at the tee starts settled on the cup, no pull in the visitor's face.
    expect(pull.weight).toBe(1);
    expect(pull.focus.target).toEqual(tuning.golf.target);

    const shelf = { ...tuning, golf: { ...tuning.golf, engaged: false } };
    const fresh = createShelfDepthOfFieldPull(shelf);
    expect(fresh.weight).toBe(0);
    expect(fresh.focus.target).toEqual(tuning.target);
    const scratch = fresh.focus;

    // The window opens: the rack starts at once and takes half a second.
    for (let i = 0; i < 15; i += 1)
      advanceShelfDepthOfFieldPull(fresh, tuning, 1 / 60);
    expect(fresh.weight).toBeCloseTo(0.5, 1);
    expect(fresh.focus.farStrength).toBeGreaterThan(1);
    // No allocation: the same focus object is written in place.
    expect(fresh.focus).toBe(scratch);
    for (let i = 0; i < 30; i += 1)
      advanceShelfDepthOfFieldPull(fresh, tuning, 1 / 60);
    expect(fresh.weight).toBe(1);
    expect(fresh.focus).toEqual(blendShelfDepthOfFieldFocus(tuning, 1));
    // The window closing lets go at once, from where it was.
    advanceShelfDepthOfFieldPull(fresh, shelf, 1 / 60);
    expect(fresh.weight).toBeLessThan(1);
  });

  it("eases in and out over the pull", () => {
    expect(golfFocusPullWeight(0)).toBe(0);
    expect(golfFocusPullWeight(1)).toBe(1);
    expect(golfFocusPullWeight(0.5)).toBe(0.5);
    expect(golfFocusPullWeight(0.1)).toBeLessThan(0.1);
    expect(golfFocusPullWeight(0.9)).toBeGreaterThan(0.9);
    expect(golfFocusPullWeight(2)).toBe(1);
  });

  it("pushes both ramps onto the real effect every frame", () => {
    const effect = new DepthOfFieldEffect(new PerspectiveCamera());

    // Before any install: the per-frame path must not depend on the layout
    // effect having run first.
    applyShelfDepthOfFieldFocusRanges(effect, {
      nearFocusRange: 60,
      farFocusRange: 10,
    });

    expect(effect.cocMaterial.focusRange).toBe(10);
    expect(effect.cocMaterial.uniforms.nearFocusRange?.value).toBe(60);
    expect(effect.cocMaterial.fragmentShader).toContain("nearFocusRange");

    applyShelfDepthOfFieldTuning(effect, {
      focusRange: 3.5,
      bokehScale: 2.4,
      resolutionScale: 0.6,
    });
    // The shelf's symmetric tuning resets the near side to match.
    expect(effect.cocMaterial.uniforms.nearFocusRange?.value).toBe(3.5);
    effect.dispose();
  });
});
