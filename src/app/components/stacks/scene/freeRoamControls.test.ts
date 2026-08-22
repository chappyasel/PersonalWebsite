import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";

import {
  FREE_ROAM_STORAGE_KEY,
  connectFreeRoamPreference,
  createFreeRoamDiagnosticsController,
  freeRoamFogVisible,
} from "./freeRoamDiagnostics";
import {
  FREE_ROAM_LOOK_LAMBDA,
  FREE_ROAM_MAX_PITCH,
  FREE_ROAM_MAX_STEP_SECONDS,
  FREE_ROAM_MOVEMENT_CODES,
  FREE_ROAM_POSE_WRITE_INTERVAL_SECONDS,
  FREE_ROAM_PRECISION_SPEED_MULTIPLIER,
  FREE_ROAM_SPEED,
  dampFreeRoamLook,
  freeRoamAxes,
  freeRoamLookAfterPointer,
  freeRoamSpeedMultiplier,
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
  it("maps WASD to the ground plane and Q/E to world height", () => {
    expect(freeRoamAxes(held("KeyW"))).toEqual({
      forward: 1,
      right: 0,
      vertical: 0,
    });
    expect(freeRoamAxes(held("KeyD", "KeyE"))).toEqual({
      forward: 0,
      right: 1,
      vertical: 1,
    });
    expect(freeRoamAxes(held("KeyQ"))).toMatchObject({ vertical: -1 });
  });

  it("cancels opposed keys instead of letting one win", () => {
    expect(
      freeRoamAxes(held("KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE")),
    ).toEqual({
      forward: 0,
      right: 0,
      vertical: 0,
    });
  });

  it("drops to one-third speed while either Shift is held", () => {
    expect(freeRoamSpeedMultiplier(held())).toBe(1);
    expect(freeRoamSpeedMultiplier(held("ShiftLeft"))).toBe(
      FREE_ROAM_PRECISION_SPEED_MULTIPLIER,
    );
    expect(freeRoamSpeedMultiplier(held("ShiftRight"))).toBe(
      FREE_ROAM_PRECISION_SPEED_MULTIPLIER,
    );
    expect(FREE_ROAM_PRECISION_SPEED_MULTIPLIER).toBeCloseTo(1 / 3, 12);
  });

  it("claims only its own keys, leaving the rest of the page alone", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"])
      expect(FREE_ROAM_MOVEMENT_CODES.has(code)).toBe(true);
    // H opens diagnostics and F leaves free roam; neither may be swallowed.
    expect(FREE_ROAM_MOVEMENT_CODES.has("KeyH")).toBe(false);
    expect(FREE_ROAM_MOVEMENT_CODES.has("KeyF")).toBe(false);
  });

  it("moves along the camera's own facing, not along world axes", () => {
    // Yawed a quarter turn left, forward is world minus-X.
    const move = freeRoamTranslation(held("KeyW"), facing(Math.PI / 2), FRAME);

    expect(move.x).toBeCloseTo(-FREE_ROAM_SPEED * FRAME, 6);
    expect(move.y).toBeCloseTo(0, 6);
    expect(move.z).toBeCloseTo(0, 6);
  });

  it("keeps Q/E vertical even when the camera is pitched down", () => {
    const move = freeRoamTranslation(
      held("KeyE"),
      facing(0, -Math.PI / 4),
      FRAME,
    );

    expect(move.y).toBeCloseTo(FREE_ROAM_SPEED * FRAME, 6);
    expect(Math.hypot(move.x, move.z)).toBeCloseTo(0, 6);
  });

  it("does not let a diagonal outrun a straight line", () => {
    const straight = freeRoamTranslation(
      held("KeyW"),
      facing(0),
      FRAME,
    ).length();
    const diagonal = freeRoamTranslation(
      held("KeyW", "KeyD", "KeyE"),
      facing(0),
      FRAME,
    ).length();

    expect(straight).toBeCloseTo(FREE_ROAM_SPEED * FRAME, 6);
    expect(diagonal).toBeCloseTo(FREE_ROAM_SPEED * FRAME, 6);
  });

  it("stands still with nothing held", () => {
    expect(freeRoamTranslation(held(), facing(0), FRAME).lengthSq()).toBe(0);
  });

  it("clamps a long frame so a stall cannot teleport the camera", () => {
    const capped = freeRoamTranslation(
      held("KeyW"),
      facing(0),
      FREE_ROAM_MAX_STEP_SECONDS,
    ).length();
    const stalled = freeRoamTranslation(held("KeyW"), facing(0), 4).length();

    expect(stalled).toBeCloseTo(capped, 12);
    expect(stalled).toBeLessThan(FREE_ROAM_SPEED * 4);
  });

  it("reuses the caller's vector so the frame loop allocates nothing", () => {
    const scratch = new THREE.Vector3();
    expect(freeRoamTranslation(held("KeyW"), facing(0), FRAME, scratch)).toBe(
      scratch,
    );
  });
});

describe("free-roam look", () => {
  it("turns left for rightward mouse movement and up for upward movement", () => {
    const look = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, 100, -100);

    expect(look.yaw).toBeLessThan(0);
    expect(look.pitch).toBeGreaterThan(0);
  });

  it("stops short of the pole, where yaw would become roll", () => {
    const up = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, 0, -100_000);
    const down = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, 0, 100_000);

    expect(up.pitch).toBe(FREE_ROAM_MAX_PITCH);
    expect(down.pitch).toBe(-FREE_ROAM_MAX_PITCH);
    expect(FREE_ROAM_MAX_PITCH).toBeLessThan(Math.PI / 2);
  });

  it("never clamps yaw, so the camera can keep turning", () => {
    const look = freeRoamLookAfterPointer({ pitch: 0, yaw: 0 }, -100_000, 0);
    expect(Math.abs(look.yaw)).toBeGreaterThan(Math.PI * 2);
  });

  it("approaches the target without overshooting it", () => {
    let look = { pitch: 0, yaw: 0 };
    const target = { pitch: 0.4, yaw: -1.2 };

    for (let frame = 0; frame < 4; frame += 1) {
      const next = dampFreeRoamLook(look, target, 1 / 60);
      expect(Math.abs(next.yaw - target.yaw)).toBeLessThan(
        Math.abs(look.yaw - target.yaw),
      );
      expect(next.yaw).toBeGreaterThanOrEqual(target.yaw);
      look = next;
    }

    // A full second is more than enough to be visually settled.
    const settled = dampFreeRoamLook(look, target, 1);
    expect(settled.pitch).toBeCloseTo(target.pitch, 3);
    expect(FREE_ROAM_LOOK_LAMBDA).toBeGreaterThan(0);
  });

  it("damps by elapsed time, so the feel does not change with frame rate", () => {
    const target = { pitch: 1, yaw: 0 };
    let sixty = { pitch: 0, yaw: 0 };
    for (let frame = 0; frame < 3; frame += 1)
      sixty = dampFreeRoamLook(sixty, target, 1 / 60);
    const twenty = dampFreeRoamLook({ pitch: 0, yaw: 0 }, target, 3 / 60);

    expect(sixty.pitch).toBeCloseTo(twenty.pitch, 6);
  });
});

describe("free-roam pose persistence", () => {
  it("writes four times a second rather than every frame", () => {
    expect(shouldWriteFreeRoamPose(0.2, 0)).toBe(false);
    expect(
      shouldWriteFreeRoamPose(FREE_ROAM_POSE_WRITE_INTERVAL_SECONDS, 0),
    ).toBe(true);
    expect(shouldWriteFreeRoamPose(10.2, 10)).toBe(false);
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

describe("the free-roam preference across a session", () => {
  const fakeStorage = (seed: Record<string, string> = {}) => {
    const items = new Map(Object.entries(seed));
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
  };

  it("restores a stored preference before anything can overwrite it", () => {
    const controller = createFreeRoamDiagnosticsController();
    const storage = fakeStorage({ [FREE_ROAM_STORAGE_KEY]: "true" });
    const entries: number[] = [];

    connectFreeRoamPreference({
      storage,
      controller,
      onEnabled: () => entries.push(1),
    });

    expect(controller.getSnapshot().enabled).toBe(true);
    // Restoring after subscribing would write the default back over the
    // stored value on first mount, which is exactly what must not happen.
    expect(storage.items.get(FREE_ROAM_STORAGE_KEY)).toBe("true");
    expect(entries).toHaveLength(1);
  });

  it("starts on the authored camera when nothing is stored", () => {
    const controller = createFreeRoamDiagnosticsController();
    const storage = fakeStorage();
    const entries: number[] = [];

    connectFreeRoamPreference({
      storage,
      controller,
      onEnabled: () => entries.push(1),
    });

    expect(controller.getSnapshot().enabled).toBe(false);
    expect(storage.items.get(FREE_ROAM_STORAGE_KEY)).toBe("false");
    expect(entries).toHaveLength(0);
  });

  it("writes every later change back and announces only the entries", () => {
    const controller = createFreeRoamDiagnosticsController();
    const storage = fakeStorage();
    const entries: number[] = [];

    connectFreeRoamPreference({
      storage,
      controller,
      onEnabled: () => entries.push(1),
    });
    controller.toggle();
    expect(storage.items.get(FREE_ROAM_STORAGE_KEY)).toBe("true");
    expect(entries).toHaveLength(1);

    controller.toggle();
    expect(storage.items.get(FREE_ROAM_STORAGE_KEY)).toBe("false");
    expect(entries).toHaveLength(1);
  });

  it("stops persisting once disconnected", () => {
    const controller = createFreeRoamDiagnosticsController();
    const storage = fakeStorage();

    connectFreeRoamPreference({
      storage,
      controller,
      onEnabled: () => undefined,
    })();
    controller.toggle();

    expect(storage.items.get(FREE_ROAM_STORAGE_KEY)).toBe("false");
  });

  it("survives a browser that refuses storage entirely", () => {
    const controller = createFreeRoamDiagnosticsController();
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(() =>
      connectFreeRoamPreference({
        storage: blocked,
        controller,
        onEnabled: () => undefined,
      }),
    ).not.toThrow();
    expect(controller.getSnapshot().enabled).toBe(false);
  });
});
