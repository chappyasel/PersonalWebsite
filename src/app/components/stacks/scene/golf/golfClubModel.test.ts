import fs from "node:fs";
import path from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { describe, expect, it } from "vitest";
import type * as THREE from "three";

import {
  filterTrianglesToHalfSpace,
  modelDetailHalfSpace,
} from "../oneSidedDetailGeometry";
import { GOLF_CLUB_FACE_CENTER_MODEL } from "./golfLayout";

function triangleCentroidXs(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index?.count ?? positions.count;
  const values: number[] = [];
  for (let triangle = 0; triangle < count; triangle += 3) {
    const a = index?.getX(triangle) ?? triangle;
    const b = index?.getX(triangle + 1) ?? triangle + 1;
    const c = index?.getX(triangle + 2) ?? triangle + 2;
    values.push(
      (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3,
    );
  }
  return values;
}

describe("scene-ready golf club model", () => {
  it("keeps groove geometry only on the striking face", async () => {
    const bytes = fs.readFileSync(
      path.resolve(process.cwd(), "public/models/golf-club.glb"),
    );
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buffer, "");
    const grooves = gltf.scene.getObjectByName("Golf_Club_3") as THREE.Mesh;
    const original = triangleCentroidXs(grooves.geometry);
    expect(original.some((x) => x < 0)).toBe(true);
    expect(original.some((x) => x > 0)).toBe(true);

    const policy = modelDetailHalfSpace(
      "/models/golf-club.glb",
      "M_PCL_Flat_White_Darker",
    );
    expect(policy).not.toBeNull();
    expect(policy?.sign).toBe(1);
    expect(GOLF_CLUB_FACE_CENTER_MODEL.x).toBeGreaterThan(0);
    const filtered = filterTrianglesToHalfSpace(grooves.geometry, policy!);
    const visible = triangleCentroidXs(filtered);
    expect(visible).toHaveLength(original.length / 2);
    expect(Math.min(...visible)).toBeGreaterThan(0);
  });
});
