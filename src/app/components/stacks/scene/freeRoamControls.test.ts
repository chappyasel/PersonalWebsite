import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";

import {
  connectFreeRoamEntryObserver,
  createFreeRoamDiagnosticsController,
  freeRoamFogVisible,
} from "./freeRoamDiagnostics";
import {
  FREE_ROAM_MOVEMENT_CODES,
  dampFreeRoamLook,
  freeRoamLookAfterPointer,
  freeRoamStepSeconds,
  freeRoamTranslation,
  shouldWriteFreeRoamPose,
} from "./freeRoamMotion";
import { freeRoamShortcutIntent } from "./freeRoamShortcut";

/** One frame at 60Hz. */
const FRAME = 1 / 60;

const held = (...codes: string[]) => new Set(codes);
const facing = (yaw: number, pitch = 0) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));

const shortcut = (
  overrides: Partial<Parameters<typeof freeRoamShortcutIntent>[0]> = {},
) => ({
  key: "f",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  editableTarget: false,
  ...overrides,
});

describe("free-roam movement", () => {
  // The authored tuning, written out rather than imported: a test that reads
  // the same constant it checks proves a number equals itself.
  const SPEED_METRES_PER_SECOND = 4;
  const STEP = SPEED_METRES_PER_SECOND * FRAME;

  const move = (keys: ReadonlySet<string>, yaw = 0, pitch = 0, delta = FRAME) =>
    freeRoamTranslation(keys, facing(yaw, pitch), delta);

  it("walks the camera forward at four metres per second", () => {
    // At rest the camera looks down world minus-Z.
    const forward = move(held("KeyW"));

    expect(forward.z).toBeCloseTo(-STEP, 12);
    expect(forward.length()).toBeCloseTo(0.06666666666666667, 12);
  });

  it("maps each key to the direction its label promises", () => {
    expect(move(held("KeyS")).z).toBeCloseTo(STEP, 12);
    expect(move(held("KeyD")).x).toBeCloseTo(STEP, 12);
    expect(move(held("KeyA")).x).toBeCloseTo(-STEP, 12);
    expect(move(held("KeyE")).y).toBeCloseTo(STEP, 12);
    expect(move(held("KeyQ")).y).toBeCloseTo(-STEP, 12);
  });

  it("cancels opposed keys instead of letting one win", () => {
    const stuck = move(held("KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE"));
    expect(stuck.lengthSq()).toBe(0);
  });

  it("stands still with nothing held", () => {
    expect(move(held()).lengthSq()).toBe(0);
  });

  it("drops to exactly one third of a step while either Shift is held", () => {
    expect(move(held("KeyW", "ShiftLeft")).length()).toBeCloseTo(STEP / 3, 12);
    expect(move(held("KeyW", "ShiftRight")).length()).toBeCloseTo(STEP / 3, 12);
    // Shift on its own is a modifier, not a direction.
    expect(move(held("ShiftLeft")).lengthSq()).toBe(0);
  });

  it("claims only its own keys, leaving the rest of the page alone", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"])
      expect(FREE_ROAM_MOVEMENT_CODES.has(code)).toBe(true);
    for (const code of ["ShiftLeft", "ShiftRight"])
      expect(FREE_ROAM_MOVEMENT_CODES.has(code)).toBe(true);
    // H opens diagnostics and F leaves free roam; neither may be swallowed.
    expect(FREE_ROAM_MOVEMENT_CODES.has("KeyH")).toBe(false);
    expect(FREE_ROAM_MOVEMENT_CODES.has("KeyF")).toBe(false);
    expect(FREE_ROAM_MOVEMENT_CODES.size).toBe(8);
  });

  it("moves along the camera's own facing, not along world axes", () => {
    // Yawed a quarter turn left, forward is world minus-X.
    const forward = move(held("KeyW"), Math.PI / 2);

    expect(forward.x).toBeCloseTo(-STEP, 12);
    expect(forward.y).toBeCloseTo(0, 12);
    expect(forward.z).toBeCloseTo(0, 12);
  });

  it("follows a pitched camera downhill rather than along the ground", () => {
    const forward = move(held("KeyW"), 0, -Math.PI / 4);

    expect(forward.y).toBeCloseTo(-STEP * Math.SQRT1_2, 12);
    expect(forward.z).toBeCloseTo(-STEP * Math.SQRT1_2, 12);
  });

  it("keeps Q/E vertical even when the camera is pitched down", () => {
    const rise = move(held("KeyE"), 0, -Math.PI / 4);

    expect(rise.y).toBeCloseTo(STEP, 12);
    expect(Math.hypot(rise.x, rise.z)).toBeCloseTo(0, 12);
  });

  it("does not let a diagonal outrun a straight line", () => {
    expect(move(held("KeyW", "KeyD", "KeyE")).length()).toBeCloseTo(STEP, 12);
  });

  it("clamps a long frame to fifty milliseconds of travel", () => {
    const stalled = move(held("KeyW"), 0, 0, 4);

    expect(stalled.length()).toBeCloseTo(SPEED_METRES_PER_SECOND * 0.05, 12);
    expect(freeRoamStepSeconds(4)).toBe(0.05);
    expect(freeRoamStepSeconds(FRAME)).toBe(FRAME);
  });

  it("reuses the caller's vector so the frame loop allocates nothing", () => {
    const scratch = new THREE.Vector3();
    expect(freeRoamTranslation(held("KeyW"), facing(0), FRAME, scratch)).toBe(
      scratch,
    );
  });
});

describe("free-roam look", () => {
  const SENSITIVITY_RADIANS_PER_PIXEL = 0.0018;

  it("turns the camera by the authored radians per pixel of mouse travel", () => {
    const look = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, 100, -100);

    // Push the mouse right, the world swings left.
    expect(look.yaw).toBeCloseTo(-100 * SENSITIVITY_RADIANS_PER_PIXEL, 12);
    expect(look.pitch).toBeCloseTo(100 * SENSITIVITY_RADIANS_PER_PIXEL, 12);
  });

  it("stops a hundredth of a radian short of the pole", () => {
    // At the pole yaw becomes roll and the horizon spins.
    const up = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, 0, -100_000);
    const down = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, 0, 100_000);

    expect(up.pitch).toBeCloseTo(Math.PI / 2 - 0.01, 12);
    expect(down.pitch).toBeCloseTo(-(Math.PI / 2 - 0.01), 12);
  });

  it("never clamps yaw, so the camera can keep turning", () => {
    const look = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, -100_000, 0);
    expect(Math.abs(look.yaw)).toBeGreaterThan(Math.PI * 2);
  });

  it("closes about a quarter of the remaining angle each 60Hz frame", () => {
    // Exponential approach at lambda 18: one frame leaves exp(-18/60) of the
    // gap. Slow enough to hide mouse jitter, fast enough to feel direct.
    const one = dampFreeRoamLook(
      { pitch: 0, yaw: 0 },
      { pitch: 1, yaw: 0 },
      FRAME,
    );

    expect(one.pitch).toBeCloseTo(1 - Math.exp(-0.3), 12);
    expect(one.pitch).toBeGreaterThan(0.2);
    expect(one.pitch).toBeLessThan(0.3);
  });

  it("approaches the target without overshooting it", () => {
    let look = { pitch: 0, yaw: 0 };
    const target = { pitch: 0.4, yaw: -1.2 };

    for (let frame = 0; frame < 4; frame += 1) {
      const next = dampFreeRoamLook(look, target, FRAME);
      expect(Math.abs(next.yaw - target.yaw)).toBeLessThan(
        Math.abs(look.yaw - target.yaw),
      );
      expect(next.yaw).toBeGreaterThanOrEqual(target.yaw);
      look = next;
    }

    // A full second is well past visually settled.
    const settled = dampFreeRoamLook(look, target, 1);
    expect(settled.pitch).toBeCloseTo(target.pitch, 6);
  });

  it("damps by elapsed time, so the feel does not change with frame rate", () => {
    const target = { pitch: 1, yaw: 0 };
    let sixty = { pitch: 0, yaw: 0 };
    for (let frame = 0; frame < 3; frame += 1)
      sixty = dampFreeRoamLook(sixty, target, FRAME);
    const twenty = dampFreeRoamLook({ pitch: 0, yaw: 0 }, target, 3 / 60);

    expect(sixty.pitch).toBeCloseTo(twenty.pitch, 12);
  });
});

describe("free-roam pose persistence", () => {
  it("writes four times a second rather than every frame", () => {
    expect(shouldWriteFreeRoamPose(0.24, 0)).toBe(false);
    expect(shouldWriteFreeRoamPose(0.25, 0)).toBe(true);
    expect(shouldWriteFreeRoamPose(10.24, 10)).toBe(false);
    expect(shouldWriteFreeRoamPose(10.3, 10)).toBe(true);
  });
});

describe("the F shortcut", () => {
  const off = { enabled: false };
  const on = { enabled: true };

  it("enters free roam and captures the mouse", () => {
    expect(freeRoamShortcutIntent(shortcut(), off)).toEqual({
      action: "toggle",
      requestPointerLock: true,
    });
  });

  it("leaves free roam without grabbing the mouse again", () => {
    expect(freeRoamShortcutIntent(shortcut(), on)).toEqual({
      action: "toggle",
      requestPointerLock: false,
    });
  });

  it("starts from the current pose on Shift+F", () => {
    expect(freeRoamShortcutIntent(shortcut({ shiftKey: true }), off)).toEqual({
      action: "start-from-current-pose",
      requestPointerLock: true,
    });
  });

  it("treats Shift+F as an exit once free roam is already running", () => {
    // Shift+F is an entry style, not a second toggle: pressing F to leave has
    // to work whether or not a thumb is still on Shift.
    expect(
      freeRoamShortcutIntent(shortcut({ shiftKey: true }), on)?.action,
    ).toBe("toggle");
  });

  it("accepts an uppercase key, which is what Shift+F actually delivers", () => {
    expect(freeRoamShortcutIntent(shortcut({ key: "F" }), off)).not.toBeNull();
  });

  it.each([
    ["a held key repeating at the OS rate", { repeat: true }],
    ["another handler already claimed it", { defaultPrevented: true }],
    ["it is a browser shortcut", { metaKey: true }],
    ["it is a browser shortcut", { ctrlKey: true }],
    ["it is a browser shortcut", { altKey: true }],
    ["someone is typing the letter f", { editableTarget: true }],
    ["it is not the f key", { key: "g" }],
  ])("ignores the keystroke when %s", (_reason, overrides) => {
    expect(freeRoamShortcutIntent(shortcut(overrides), off)).toBeNull();
  });
});

describe("free-roam fog", () => {
  let controller: ReturnType<typeof createFreeRoamDiagnosticsController>;

  beforeEach(() => {
    controller = createFreeRoamDiagnosticsController();
  });

  it("keeps the scene's own fog for everyone outside free roam", () => {
    expect(freeRoamFogVisible(controller.getSnapshot())).toBe(true);
  });

  it("clears fog on entry, because it hides what free roam is for", () => {
    controller.setEnabled(true);
    expect(freeRoamFogVisible(controller.getSnapshot())).toBe(false);
  });

  it("can be turned back on from diagnostics while roaming", () => {
    controller.setEnabled(true);
    controller.setFogEnabled(true);
    expect(freeRoamFogVisible(controller.getSnapshot())).toBe(true);
  });

  it("restores the scene's fog on the way out", () => {
    controller.setEnabled(true);
    controller.setFogEnabled(true);
    controller.setEnabled(false);
    expect(freeRoamFogVisible(controller.getSnapshot())).toBe(true);
  });

  it("refuses to clear fog for a camera that is not roaming", () => {
    controller.setFogEnabled(true);
    expect(controller.getSnapshot().fogEnabled).toBe(false);
    expect(freeRoamFogVisible(controller.getSnapshot())).toBe(true);
  });
});

describe("the free-roam entry observer", () => {
  it("announces an entry once, not again on every later publication", () => {
    // The controller publishes for fog too. Dismissing the mobile sheet
    // closes an open panel and steps browser history back with it, so a
    // repeat call is not free.
    const controller = createFreeRoamDiagnosticsController();
    const entries: number[] = [];

    connectFreeRoamEntryObserver({
      controller,
      onEnabled: () => entries.push(1),
    });
    controller.setEnabled(true);
    expect(entries).toHaveLength(1);

    controller.setFogEnabled(true);
    controller.setFogEnabled(false);
    expect(controller.getSnapshot().enabled).toBe(true);
    expect(entries).toHaveLength(1);
  });

  it("announces the next entry after the camera has left", () => {
    const controller = createFreeRoamDiagnosticsController();
    const entries: number[] = [];

    connectFreeRoamEntryObserver({
      controller,
      onEnabled: () => entries.push(1),
    });
    controller.toggle();
    controller.toggle();
    controller.toggle();

    expect(entries).toHaveLength(2);
  });

  it("counts an already-enabled controller as the first entry", () => {
    const controller = createFreeRoamDiagnosticsController();
    const entries: number[] = [];
    controller.setEnabled(true);

    connectFreeRoamEntryObserver({
      controller,
      onEnabled: () => entries.push(1),
    });
    controller.setFogEnabled(true);

    expect(entries).toHaveLength(1);
  });

  it("stops observing once disconnected", () => {
    const controller = createFreeRoamDiagnosticsController();
    const entries: number[] = [];

    connectFreeRoamEntryObserver({
      controller,
      onEnabled: () => entries.push(1),
    })();
    controller.toggle();

    expect(entries).toHaveLength(0);
  });
});
