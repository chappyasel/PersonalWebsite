import { describe, expect, it } from "vitest";

import { promoteGizmoIntersections } from "./sceneLayoutGizmoPriority";

type Node = { parent: Node | null; label: string };

const node = (label: string, parent: Node | null = null): Node => ({
  label,
  parent,
});
const hit = (object: Node, distance: number) => ({ object, distance });

describe("layout gizmo hit priority", () => {
  const gizmo = node("gizmo-frame");
  const arrow = node("axis-arrow", node("pivot-controls", gizmo));
  const prop = node("shampoo-bottle", node("unit-systems"));
  const shelf = node("plank");

  it("moves a handle in front of the prop occluding it", () => {
    // The failure this fixes: the bottle is nearer, stops propagation on the
    // press, and the arrow behind it never hears about the gesture.
    const ordered = promoteGizmoIntersections(
      [hit(prop, 3), hit(arrow, 5), hit(shelf, 9)],
      gizmo,
    );
    expect(ordered.map((item) => item.object.label)).toEqual([
      "axis-arrow",
      "shampoo-bottle",
      "plank",
    ]);
  });

  it("leaves a list the gizmo already leads, and one it is absent from", () => {
    const leading = [hit(arrow, 2), hit(prop, 4)];
    expect(promoteGizmoIntersections(leading, gizmo)).toBe(leading);
    const absent = [hit(prop, 4), hit(shelf, 8)];
    expect(promoteGizmoIntersections(absent, gizmo)).toBe(absent);
  });

  it("does nothing at all with no selection", () => {
    // The component renders null between selections, so the frame ref is
    // empty and every intersection in the scene passes through untouched.
    const items = [hit(prop, 4), hit(arrow, 5)];
    expect(promoteGizmoIntersections(items, null)).toBe(items);
  });

  it("keeps several handles in their own distance order", () => {
    const ring = node("axis-rotator", node("pivot-controls", gizmo));
    const ordered = promoteGizmoIntersections(
      [hit(prop, 1), hit(arrow, 6), hit(shelf, 7), hit(ring, 8)],
      gizmo,
    );
    expect(ordered.map((item) => item.object.label)).toEqual([
      "axis-arrow",
      "axis-rotator",
      "shampoo-bottle",
      "plank",
    ]);
  });
});
