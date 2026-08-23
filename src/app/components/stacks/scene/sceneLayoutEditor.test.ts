import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  sceneLayoutEditorController as editor,
  sceneLayoutNudgeForKeyboard,
} from "./sceneLayoutEditor";

afterEach(() => editor.resetForTests());

function register(
  id: string,
  authored: readonly [number, number, number] = [0, 0, 0],
) {
  const root = new THREE.Group();
  root.position.fromArray(authored);
  const cancelInteraction = vi.fn();
  const unregister = editor.register({
    id,
    label: id,
    unitIndex: 0,
    authored,
    authoredRotation: [0, 0, 0],
    root,
    cancelInteraction,
  });
  return { root, cancelInteraction, unregister };
}

describe("scene layout editor", () => {
  it("keeps edits session-local and exports stable parent-local deltas", () => {
    const second = register("b", [0.1, 0, 0.2]);
    register("a", [0, 0, 0]);

    editor.setEnabled(true);
    editor.select("b");
    expect(second.cancelInteraction).toHaveBeenCalledOnce();
    expect(editor.update("b", [0.123456, -0, 0.35])).toBe(true);

    expect(editor.export()).toEqual([
      {
        id: "b",
        unitIndex: 0,
        label: "b",
        authored: [0.1, 0, 0.2],
        preview: [0.1235, 0, 0.35],
        delta: [0.0235, 0, 0.15],
        authoredRotation: [0, 0, 0],
        previewRotation: [0, 0, 0],
        rotationDelta: [0, 0, 0],
      },
    ]);
    expect(second.root.position.toArray()).toEqual([0.1235, 0, 0.35]);

    editor.setEnabled(false);
    expect(editor.export()).toEqual([]);
    expect(editor.getSnapshot().selectedId).toBeNull();
    expect(second.root.position.toArray()).toEqual([0.1, 0, 0.2]);
  });

  it("retains an unavailable edited record until reset", () => {
    const target = register("photo", [0, 0, 0.1]);
    editor.setEnabled(true);
    editor.select("photo");
    editor.update("photo", [0, 0, 0.2]);
    target.unregister();

    expect(editor.getSnapshot().records[0]).toMatchObject({
      id: "photo",
      available: false,
      preview: [0, 0, 0.2],
    });
    expect(editor.export()).toHaveLength(1);
    editor.reset("photo");
    expect(editor.export()).toEqual([]);
  });

  it("rejects duplicate live targets and invalid coordinates", () => {
    register("duplicate");
    expect(() => register("duplicate")).toThrow(
      "duplicate layout target: duplicate",
    );
    editor.setEnabled(true);
    editor.select("duplicate");
    expect(editor.update("duplicate", [Number.NaN, 0, 0])).toBe(false);
  });

  it("selects registered props and nudges them with free-camera keys", () => {
    const target = register("photo", [0.1, 0, 0.2]);
    expect(editor.canSelect("photo")).toBe(false);
    editor.setEnabled(true);
    expect(editor.canSelect("photo")).toBe(true);
    editor.select("photo");

    const forward = sceneLayoutNudgeForKeyboard({
      code: "ArrowUp",
      shiftKey: false,
    });
    expect(forward).toEqual([0, 0, 0.05]);
    expect(forward && editor.nudgeSelected(forward)).toBe(true);
    expect(target.root.position.toArray()).toEqual([0.1, 0, 0.25]);
    expect(
      sceneLayoutNudgeForKeyboard({ code: "PageUp", shiftKey: true }),
    ).toEqual([0, 0.01, 0]);
  });

  it("undoes and redoes movement and rotation", () => {
    const target = register("photo", [0.1, 0, 0.2]);
    editor.setEnabled(true);
    editor.select("photo");
    editor.update("photo", [0.2, 0, 0.3]);
    editor.updateRotation("photo", [0, Math.PI / 4, 0]);

    expect(editor.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
    expect(editor.undo()).toBe(true);
    expect(target.root.rotation.y).toBe(0);
    expect(target.root.position.toArray()).toEqual([0.2, 0, 0.3]);
    expect(editor.undo()).toBe(true);
    expect(target.root.position.toArray()).toEqual([0.1, 0, 0.2]);
    expect(editor.redo()).toBe(true);
    expect(target.root.position.toArray()).toEqual([0.2, 0, 0.3]);
  });

  it("coalesces a gizmo drag into one undo step", () => {
    const target = register("photo");
    editor.setEnabled(true);
    editor.select("photo");
    editor.setGestureActive(true);
    editor.update("photo", [0.1, 0, 0]);
    editor.update("photo", [0.2, 0, 0]);
    editor.setGestureActive(false);

    expect(editor.undo()).toBe(true);
    expect(target.root.position.toArray()).toEqual([0, 0, 0]);
    expect(editor.undo()).toBe(false);
  });

});
