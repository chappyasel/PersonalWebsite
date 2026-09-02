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
    expect(cameraRig).toContain("if (event.pointerId !== lookPointerId) return;");
    expect(cameraRig).toContain('addEventListener("contextmenu", onContextMenu)');
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
    expect(chromeLayer).toContain(
      "freeRoamChromeVisibility.enter()",
    );
    expect(chromeLayer).toContain(
      "freeRoamChromeVisibility.exit()",
    );
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

  it("mounts the pass from the resolved tuning, or not at all", () => {
    expect(effects).toContain("resolveShelfDepthOfFieldTuning({");
    expect(effects).toContain(
      "{depthOfFieldTuning && <LiveBokehDepthOfField {...depthOfFieldTuning} />}",
    );
  });
});
