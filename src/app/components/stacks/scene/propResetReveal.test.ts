import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { beginPropResetReveal } from "./propResetReveal";

function fixture() {
  const material = new THREE.MeshStandardMaterial({ opacity: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const neighbor = new THREE.Mesh(mesh.geometry, material);
  const root = new THREE.Group();
  root.add(mesh);
  return { material, mesh, neighbor, root };
}

describe("visible prop reset reveal", () => {
  it("fades and scales only the returning prop, then restores its materials", () => {
    const { material, mesh, neighbor, root } = fixture();
    root.scale.setScalar(1.4);
    const reveal = beginPropResetReveal(root, false);
    const temporary = mesh.material;
    const dispose = vi.spyOn(temporary, "dispose");
    expect(temporary).not.toBe(material);
    expect(temporary.opacity).toBe(0);
    expect(root.scale.x).toBeCloseTo(1.4 * 0.82);
    expect(neighbor.material.opacity).toBe(0.8);
    expect(neighbor.material.transparent).toBe(false);
    expect(reveal.advance(0.1)).toBe(false);
    expect(temporary.opacity).toBeGreaterThan(0);
    expect(temporary.opacity).toBeLessThan(0.8);
    expect(root.scale.x).toBeGreaterThan(1.4 * 0.82);
    expect(reveal.advance(0.3)).toBe(true);
    expect(root.scale.x).toBe(1.4);
    expect(mesh.material).toBe(material);
    expect(material.depthWrite).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    reveal.finish();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("uses opacity alone with reduced motion", () => {
    const { root, mesh } = fixture();
    const reveal = beginPropResetReveal(root, true);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    reveal.advance(0.09);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    expect(mesh.material.opacity).toBeGreaterThan(0);
    expect(reveal.advance(0.09)).toBe(true);
  });

  it("finishes immediately on interruption without overwriting a new material", () => {
    const { root, mesh } = fixture();
    const reveal = beginPropResetReveal(root, false);
    const temporary = mesh.material;
    const dispose = vi.spyOn(temporary, "dispose");
    const replacement = new THREE.MeshStandardMaterial();
    mesh.material = replacement;
    reveal.finish();
    expect(mesh.material).toBe(replacement);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
