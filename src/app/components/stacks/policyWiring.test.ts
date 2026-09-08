import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Wiring contracts, held at source level on purpose.
 *
 * Everything here asserts that a component CALLS a policy module, not what
 * that policy decides. The decisions are covered by behavior tests:
 * `freeRoamControls.test.ts`, `shelfDepthOfField.test.ts`,
 * `Effects.contract.test.tsx`.
 *
 * These are source reads because there is no way yet to reach the call sites
 * in process. `ChromeLayer` installs its listeners from a `useEffect`, and
 * `CameraRig` runs inside an r3f frame loop; a server render executes neither,
 * and this repo has no DOM environment and no r3f test harness. The extraction
 * work in this tranche moved the DECISIONS behind interfaces, which is what
 * made them testable. Proving the wiring still needs the file.
 *
 * Each assertion is deliberately one narrow token at one call site, so a
 * rename inside a policy module is caught while ordinary editing around the
 * call site is not. Delete this whole file the day a DOM or r3f harness can
 * mount the two components; nothing here is worth keeping past that.
 */
const source = (path: string) =>
  fs.readFileSync(new URL(path, import.meta.url), "utf8");

const cameraRig = source("./scene/CameraRig.tsx");
const chromeLayer = source("./dom/ChromeLayer.tsx");
const effects = source("./scene/Effects.tsx");
const golfExperience = source("./scene/golf/GolfExperience.tsx");
const scrollBridges = source("./input/ScrollBridges.tsx");
const opticalPrototype = source("./scene/OpticalBokehPrototype.tsx");
const environment = source("./scene/SceneEnvironment.tsx");
const meadow = source("./scene/Meadow.tsx");

describe("free-roam wiring", () => {
  it("runs the F shortcut through the intent policy and executes both branches", () => {
    expect(chromeLayer).toContain("freeRoamShortcutIntent(");
    expect(chromeLayer).toContain(
      "editableTarget: isEditableShortcutTarget(event.target)",
    );
    expect(chromeLayer).toContain(
      'intent.action === "start-from-current-pose"',
    );
    expect(chromeLayer).toContain(
      "freeRoamDiagnosticsController.startFromCurrentPose()",
    );
    expect(chromeLayer).toContain("freeRoamDiagnosticsController.toggle()");
    // The guards belong to the policy now; none may be re-spelled here.
    expect(chromeLayer).not.toContain('event.key.toLowerCase() !== "f"');
  });

  it("never captures the mouse, so the left button still reaches the scene", () => {
    // The layout editor selects a prop with a click and drags its gizmo with
    // the pointer visible. A pointer lock anywhere on the free-roam path
    // would take both away.
    expect(chromeLayer).not.toContain("requestPointerLock");
    expect(cameraRig).not.toContain("requestPointerLock");
    expect(cameraRig).not.toContain("pointerLockElement");
  });

  it("looks only while the right button is held, and ignores its menu", () => {
    expect(cameraRig).toContain("event.button !== FREE_ROAM_LOOK_BUTTON");
    expect(cameraRig).toContain("lookPointerId = event.pointerId");
    expect(cameraRig).toContain(
      "if (event.pointerId !== lookPointerId) return;",
    );
    expect(cameraRig).toContain(
      'addEventListener("contextmenu", onContextMenu)',
    );
    // Releasing or losing the pointer ends the look; so does losing focus.
    expect(cameraRig).toContain('addEventListener("pointerup", onPointerUp)');
    expect(cameraRig).toContain(
      'addEventListener("pointercancel", onPointerUp)',
    );
    expect(cameraRig).toContain('addEventListener("blur", clearInput)');
  });

  it("observes free-roam entry through one connector", () => {
    expect(chromeLayer.match(/connectFreeRoamEntryObserver\(\{/g)).toHaveLength(
      1,
    );
    // Entry dismisses the sheet and wakes the layout editor from the same
    // connector; neither may grow a second observer or touch storage.
    expect(chromeLayer).toMatch(
      /onEnabled: \(\) => \{[\s\S]*?setStacksSheetDismissed\(true\)/,
    );
    expect(chromeLayer).toMatch(
      /onEnabled: \(\) => \{[\s\S]*?sceneLayoutEditorController\.setEnabled\(true\)/,
    );
    expect(chromeLayer).toContain("freeRoamChromeVisibility.enter()");
    expect(chromeLayer).toContain("freeRoamChromeVisibility.exit()");
    expect(chromeLayer).toContain("setPropReactionsSuppressed(true)");
    expect(chromeLayer).toContain("setPropReactionsSuppressed(false)");
    expect(chromeLayer).not.toContain("localStorage");
  });

  it("filters both key handlers through the claimed-key set", () => {
    expect(
      cameraRig.match(/FREE_ROAM_MOVEMENT_CODES\.has\(event\.code\)/g),
    ).toHaveLength(2);
    // Someone typing into a diagnostics field is not flying.
    expect(cameraRig).toContain("isEditableShortcutTarget(event.target)");
  });

  it("turns raw pointer movement into a look target through the policy", () => {
    expect(cameraRig).toContain("freeRoamLookAfterPointer(");
    expect(cameraRig).toContain("event.movementX");
    expect(cameraRig).toContain("event.movementY");
    expect(cameraRig).not.toContain("FREE_ROAM_LOOK_SENSITIVITY");
  });

  it("damps the look and translates the camera from the same clamped step", () => {
    expect(cameraRig).toContain("const dt = freeRoamStepSeconds(delta);");
    expect(cameraRig).toContain("dampFreeRoamLook(");
    // The damped yaw makes WASD follow the visible heading. Passing yaw rather
    // than the full camera rotation keeps pitch out of horizontal movement.
    // The scratch vector means the frame loop allocates none.
    expect(cameraRig).toMatch(
      /freeRoamTranslation\(\s*freeRoamKeys\.current,\s*look\.yaw,\s*dt,\s*freeRoamMove\.current,?\s*\)/,
    );
    expect(cameraRig).not.toContain("Math.min(delta, 0.05)");
  });

  it("rate-limits pose writes and restores a stored pose on entry", () => {
    expect(cameraRig).toContain("shouldWriteFreeRoamPose(");
    expect(cameraRig).toContain("clock.elapsedTime");
    expect(cameraRig).toContain("writeFreeRoamPose(");
    expect(cameraRig).toContain("readFreeRoamPose(");
  });

  it("reads fog from one policy in both consumers", () => {
    // These two had drifted into opposite spellings of the same rule.
    expect(environment).toContain("freeRoamFogVisible(freeRoam)");
    expect(meadow).toContain("freeRoamFogVisible(freeRoam)");
    expect(environment).not.toContain(
      "!freeRoam.enabled || freeRoam.fogEnabled",
    );
    expect(meadow).not.toContain("freeRoam.enabled && !freeRoam.fogEnabled");
  });
});

describe("depth-of-field wiring", () => {
  // The one thing a server render cannot reach: `renderToStaticMarkup` runs no
  // effects, so `Effects.contract.test.tsx` proves the pass MOUNTS but never
  // that its live tuning is applied. That is asserted here and in
  // `shelfDepthOfField.test.ts`, which drives a real DepthOfFieldEffect.
  it("applies the resolved tuning to the mounted effect in a layout effect", () => {
    const wrapper = effects.slice(
      effects.indexOf("function LiveBokehDepthOfField"),
      effects.indexOf("function ComposerPixelRatio"),
    );

    expect(wrapper).toContain("useLayoutEffect(");
    expect(wrapper).toContain("if (!effect.current) return;");
    expect(wrapper).toContain("applyShelfDepthOfFieldTuning(effect.current, {");
    expect(wrapper).toContain("focusRange,");
    expect(wrapper).toContain("bokehScale,");
    expect(wrapper).toContain("resolutionScale,");
    // Whitespace-tolerant: the point is that all three tuning values are in
    // the dependency array, not how Prettier chose to wrap it.
    expect(wrapper).toMatch(
      /\}\s*,\s*\[\s*bokehScale\s*,\s*focusRange\s*,\s*resolutionScale\s*\]\s*\)/,
    );
    // Constructor values stay stable so the wrapper cannot rebuild the effect.
    expect(wrapper).toContain("<DepthOfField");
    expect(wrapper).toContain("ref={effect}");
  });

  it("runs the one shared rack from both lenses' frame loops", () => {
    const wrapper = effects.slice(
      effects.indexOf("function LiveBokehDepthOfField"),
      effects.indexOf("function ComposerPixelRatio"),
    );

    // The rack is a per-frame concern: real seconds in, both ramps and the
    // blended target out, before the composer draws. Never per-frame steps.
    // The production lens is the optical one, so it must run the very same
    // object, from the same golf window.
    expect(wrapper).toMatch(/useFrame\(\(_, frameSeconds\)/);
    expect(wrapper).toMatch(
      /advanceShelfDepthOfFieldPull\(\s*pull\.current,\s*tuning\.current,\s*frameSeconds,\s*golfMode\.weight,?\s*\)/,
    );
    expect(wrapper).toContain("applyShelfDepthOfFieldFocusRanges(live, focus)");
    expect(wrapper).toContain(
      "focusPullTarget(focus.target, focusPull, measured)",
    );
    expect(effects).toMatch(
      /<OpticalBokehPrototype\s+shelf=\{depthOfFieldTuning\}/,
    );
    expect(opticalPrototype).toMatch(
      /advanceShelfDepthOfFieldPull\(\s*pull\.current,\s*shelf,\s*frameSeconds,\s*golfMode\.weight,?\s*\)/,
    );
    expect(opticalPrototype).toContain(
      'effect.uniforms.get("uNearStrength")!.value = focus.nearStrength;',
    );
    expect(opticalPrototype).toContain(
      'effect.uniforms.get("uFarStrength")!.value = focus.farStrength;',
    );
    // The camera's pivot rides the same window and the same clock.
    expect(cameraRig).toMatch(
      /advanceGolfFocusPull\(\s*golfPivot\.current,\s*golfModeTarget\.current,\s*dt,?\s*\)/,
    );
  });

  it("mounts only the selected model from the resolved tuning", () => {
    expect(effects).toContain("resolveShelfDepthOfFieldTuning({");
    expect(effects).toMatch(
      /\{depthOfFieldTuning && depthOfFieldModel === "current" && \(\s*<LiveBokehDepthOfField \{\.\.\.depthOfFieldTuning\} \/>/,
    );
    expect(effects).toMatch(
      /\{depthOfFieldTuning && depthOfFieldModel !== "current" && \(\s*<OpticalBokehPrototype/,
    );
  });
});

describe("golf suspense wiring", () => {
  it("advances the push-in from the physics loop and aims the camera through the transient", () => {
    // Gate, reduced motion and the golf window all pass through `allowed`;
    // the state still advances so an open push eases out on its own.
    expect(golfExperience).toMatch(
      /advanceGolfSuspense\(\s*suspense\.current,\s*balls\.current,\s*cup,\s*delta,\s*active && motion\.suspenseZoom && golfSuspenseEnabled\(\),?\s*\)/,
    );
    expect(golfExperience).toContain("golfSuspense.weight = 0;");
    // The rig reads the weight for the aim and the lens, nothing else.
    expect(cameraRig).toContain("if (golfSuspense.weight > 0) {");
    expect(cameraRig).toContain("golfSuspenseFovScale(golfSuspense.weight)");
  });

  it("decides golf mode from the green's coverage on the pre-golf pose", () => {
    // The rule (golfVisibility.ts) is measured on the pose the rig has
    // built before the cup pivot and the push-in, with the pointer's full
    // pan restored, and its switch is what the store's golfFocused mirrors.
    const measuredAt = cameraRig.indexOf("golfCoverage = golfModeCoverage(");
    const pivotAt = cameraRig.indexOf("golfYawRig({");
    const headAt = cameraRig.indexOf("aimForHeadTurn({");
    expect(measuredAt).toBeGreaterThan(headAt);
    expect(measuredAt).toBeLessThan(pivotAt);
    expect(cameraRig).toContain(
      "authoredLookX + (pointerSwingFull.current - pointerSwing.current)",
    );
    // The in-golf pose is the pivot's own base for the pivot's own run.
    expect(cameraRig).toContain("inGolf.look[0] = look.current.x - pointerSwing.current;");
    expect(cameraRig).toMatch(/run: golfRun\.current,\s*\},\s*golfTuning,\s*\);/);
    expect(cameraRig).toContain(
      "golfModeTarget.current = golfModeWeight(golfCoverage, golfTuning);",
    );
    expect(cameraRig).toContain("useStacks.getState().setGolfFocused(golfMode.engaged);");
    // The punch-in and the mobile look offset ride the mode's eased weight
    // with the rack and the pivot (the owner's call); the measurement adds
    // back the share of the dolly not yet in so it never reads itself. The
    // stop window keeps only the URL.
    expect(cameraRig).toContain("const golfDolly = golfDollyForViewport(size.width, true);");
    expect(cameraRig).toContain("const golfZoom = golfDolly * golfPivotWeight;");
    expect(cameraRig).toContain("golfLookYOffsetForViewport(size.width, true) * golfPivotWeight");
    expect(cameraRig).toContain("const dollyNotYetIn = golfDolly * (1 - golfPivotWeight);");
    expect(cameraRig).toContain("pose.eye[2] = authoredEyeZ - dollyNotYetIn;");
    expect(cameraRig).toContain("inGolf.eye[2] = baseZ - dollyNotYetIn;");
    expect(cameraRig).toContain("useStacks.getState().setGolfStop(golfStop);");
    expect(cameraRig).not.toContain("state.golfFocused");
    expect(scrollBridges).toContain("golfFocused: useStacks.getState().golfStop,");
    expect(scrollBridges).toContain("state.golfStop === mirrored.golfFocused");
    // A jump seeds the mode from the window so a deep link shows the tee.
    expect(cameraRig).toMatch(
      /golfModeState\.current = createGolfModeState\(golfStop\);\s*golfModeTarget\.current = golfStop \? 1 : 0;/,
    );
  });

  it("hands the pointer yaw and the pan over to the cup pivot at the tee", () => {
    // The pan fades by the pivot's weight and the rig rotation blends in by
    // the same weight, which is the depth of field's own rack clock.
    expect(cameraRig).toMatch(
      /parallaxLookOffset\(pointerX, composition\) \*\s*calm \*\s*\(1 - golfPivotWeight\)/,
    );
    expect(cameraRig).toContain("golfFocusPullWeight(golfPivot.current)");
    expect(cameraRig).toMatch(
      /golfYawRig\(\{[\s\S]*?pivotX: GOLF_CUP_WORLD_CENTER\.x,[\s\S]*?run: golfRun\.current,/,
    );
    // The pivot's run is the pointer's own (unit max), not the orbit dial's,
    // so the presets without an orbit still pin the green.
    expect(cameraRig).toContain(
      "pointerCameraYawDegrees(pointerX, composition.parallaxCentre, 1)",
    );
    // Ordering: orbit, then head turn, then the pivot, then the committed aim
    // and the push-in on top. The pivot must outrank the head turn or the
    // head preset swings the green off the pin.
    const orbitAt = cameraRig.indexOf("eyeXZForYawAroundTarget({");
    const headAt = cameraRig.indexOf("aimForHeadTurn({");
    const pivotAt = cameraRig.indexOf("golfYawRig({");
    const aimAt = cameraRig.indexOf(
      "travelLook.current.set(authoredLookX, authoredLookY, authoredLookZ)",
    );
    const pushAt = cameraRig.indexOf("if (golfSuspense.weight > 0) {");
    expect(orbitAt).toBeGreaterThan(0);
    expect(headAt).toBeGreaterThan(orbitAt);
    expect(pivotAt).toBeGreaterThan(headAt);
    expect(aimAt).toBeGreaterThan(pivotAt);
    expect(pushAt).toBeGreaterThan(aimAt);
  });
});

describe("pointer arrival wiring", () => {
  it("lets the pointer in over the boot handoff by easing the input from its rest", () => {
    // The ramp reads the boot session for the handoff and r3f's own seeded
    // (0, 0) for "has the mouse been heard from". It steps on the real
    // frame, never the hidden settle step.
    expect(cameraRig).toMatch(
      /advancePointerArrival\(pointerArrival\.current, \{\s*revealed: bootView\.revealed,\s*pointerSeen: pointer\.x !== 0 \|\| pointer\.y !== 0,\s*frameSeconds: frame,\s*\}\)/,
    );
    // The rest is the composition's parallax centre for the run and the
    // screen centre for the rise, and it is applied where the pointer is
    // read, once, so every reader of pointerX/pointerY (parallax, truck,
    // orbit, head turn, cup pivot, seated sway) rides the same weight.
    expect(cameraRig).toContain(
      "pointerFromRest(pointer.x, composition.parallaxCentre, pointerWeight)",
    );
    expect(cameraRig).toContain("pointerFromRest(pointer.y, 0, pointerWeight)");
    // No other code line reads the raw pointer: the seen check and the two
    // eased reads are the whole contract (comments may mention it).
    const rawPointerReads = cameraRig
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .filter((line) => /\bpointer\.[xy]\b/.test(line));
    expect(rawPointerReads).toHaveLength(3);
    // Screenshot mode, the layout gizmo and an OG capture still read the
    // centred pointer they always did.
    expect(cameraRig).toContain(
      "const neutralPointer = layoutGesture || screenshot.enabled || ogCapture;",
    );
  });

  it("settles the rig instantly while the boot screen hides it", () => {
    expect(cameraRig).toContain(
      "const dt = bootView.revealed ? frame : HIDDEN_SETTLE_SECONDS;",
    );
    // The settle timer stays on the real frame so a boot cannot stamp a
    // unit as settled in one step.
    expect(cameraRig).toContain("settledFor.current += frame;");
    expect(cameraRig).not.toContain("settledFor.current += dt;");
  });
});
