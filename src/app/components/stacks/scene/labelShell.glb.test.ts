// Runs the label-shell helpers against the REAL tub GLB the scene ships, via
// the same loader/decoder pair drei's useGLTF uses, so the numbers here are
// the numbers the browser sees. Guards the thing the cylinder got wrong: the
// strip must sit outside every wall vertex in its height band.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type * as THREE from "three";
import { GLTFLoader, MeshoptDecoder } from "three-stdlib";
import { describe, expect, it } from "vitest";

import {
  convexHull2D,
  labelShellGeometry,
  orderForLabel,
  wallFootprint,
} from "./labelShell";

const GLB = path.join(process.cwd(), "public", "models", "protein-powder.glb");
const PROTEIN_SCALE = 2.082;

async function loadScene(): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const decoder =
    typeof MeshoptDecoder === "function"
      ? (MeshoptDecoder as unknown as () => unknown)()
      : MeshoptDecoder;
  loader.setMeshoptDecoder(decoder as never);
  const buffer = readFileSync(GLB);
  const array = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new Promise((resolve, reject) => {
    loader.parse(array, "", (gltf) => resolve(gltf.scene), reject);
  });
}

describe("protein tub label shell (real GLB)", () => {
  it("wraps outside the tub wall across the label's height band", async () => {
    const scene = await loadScene();
    const names: string[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m?.name) names.push(m.name);
    });
    expect(names).toContain("Plastic1Protein1");

    const slice = wallFootprint(scene, {
      scale: PROTEIN_SCALE,
      materialName: "Plastic1Protein1",
      from: 0.3,
      to: 0.7,
    });
    const h = slice.yMax - slice.yMin;
    const y0 = slice.yMin + 0.12 * h;
    const y1 = slice.yMin + 0.8 * h;
    // Every wall vertex inside the band the strip spans, not only the slice
    // the hull is taken from.
    const band = wallFootprint(scene, {
      scale: PROTEIN_SCALE,
      materialName: "Plastic1Protein1",
      from: 0.12,
      to: 0.8,
    });
    const ring = orderForLabel(convexHull2D(slice.points));
    const shell = labelShellGeometry(slice.points, y0, y1, 1.015);
    const pos = shell.attributes.position!;

    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= Math.max(1, ring.length);
    cz /= Math.max(1, ring.length);
    const radial = (x: number, z: number) => Math.hypot(x - cx, z - cz);
    const wallR = band.points.map(([x, z]) => radial(x, z));
    const shellR: number[] = [];
    for (let i = 0; i < pos.count; i += 2) shellR.push(radial(pos.getX(i), pos.getZ(i)));

    const stats = {
      sliceVertices: slice.points.length,
      bandVertices: band.points.length,
      hullVertices: ring.length,
      body: { yMin: slice.yMin, yMax: slice.yMax },
      strip: { y0, y1 },
      wallRadius: wallR.length
        ? { min: Math.min(...wallR), max: Math.max(...wallR) }
        : null,
      shellRadius: shellR.length
        ? { min: Math.min(...shellR), max: Math.max(...shellR) }
        : null,
      centroid: { x: cx, z: cz },
      shellPositionCount: pos.count,
    };
    // vitest swallows console.log; leave the numbers where a human can read them.
    const out = process.env.LABEL_SHELL_STATS;
    if (out) writeFileSync(out, JSON.stringify(stats, null, 2));

    expect(stats.sliceVertices, JSON.stringify(stats)).toBeGreaterThanOrEqual(8);
    expect(stats.hullVertices, JSON.stringify(stats)).toBeGreaterThanOrEqual(6);
    expect(pos.count, JSON.stringify(stats)).toBeGreaterThan(12);
    // The strip must clear the wall in its band: compare each band vertex
    // against the shell's radius in the same direction.
    const shellAt = (angle: number) => {
      let best = Infinity;
      let r = 0;
      for (let i = 0; i < pos.count; i += 2) {
        const a = Math.atan2(pos.getZ(i) - cz, pos.getX(i) - cx);
        const d = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
        if (d < best) {
          best = d;
          r = radial(pos.getX(i), pos.getZ(i));
        }
      }
      return r;
    };
    let inside = 0;
    for (const [x, z] of band.points) {
      const r = radial(x, z);
      if (r > shellAt(Math.atan2(z - cz, x - cx)) + 1e-4) inside++;
    }
    expect(inside, `wall vertices proud of the strip: ${inside} ${JSON.stringify(stats)}`).toBe(0);
  });
});
