import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { articulateDeskLampHead, deskLampShadeGlowStrength } from "./ModelProp";
import { ABOUT_LAMP_HEAD_QUATERNION } from "./aboutCoordinationLayout";
import {
  DESK_LAMP_HEAD_NODE,
  DESK_LAMP_HEAD_PIVOT,
  DESK_LAMP_MOUTH,
  DESK_LAMP_MOUTH_TILT,
  DESK_LAMP_SHADE_GLOW_NODE,
  DESK_LAMP_SHADE_NODE,
  deskLampPointAlongAxis,
} from "./deskLampHead";

async function loadDeskLamp() {
  const bytes = fs.readFileSync(
    path.resolve(process.cwd(), "public/models/desk-lamp.glb"),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return (
    await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(buffer, "")
  ).scene;
}

function meshTriangles(mesh: THREE.Mesh): THREE.Triangle[] {
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex();
  const triangleCount = (index ? index.count : position.count) / 3;
  const vertex = (triangle: number, corner: number) => {
    const vertexIndex = index
      ? index.getX(triangle * 3 + corner)
      : triangle * 3 + corner;
    return new THREE.Vector3()
      .fromBufferAttribute(position, vertexIndex)
      .applyMatrix4(mesh.matrixWorld);
  };
  return Array.from(
    { length: triangleCount },
    (_, triangle) =>
      new THREE.Triangle(
        vertex(triangle, 0),
        vertex(triangle, 1),
        vertex(triangle, 2),
      ),
  );
}

function meshVerticesAbove(mesh: THREE.Mesh, minimumY: number) {
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex();
  const count = index ? index.count : position.count;
  const vertices: THREE.Vector3[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const vertexIndex = index ? index.getX(offset) : offset;
    const vertex = new THREE.Vector3()
      .fromBufferAttribute(position, vertexIndex)
      .applyMatrix4(mesh.matrixWorld);
    if (vertex.y > minimumY) vertices.push(vertex);
  }
  return vertices;
}

describe("desk-lamp head frame", () => {
  it("puts the recovered GLB head on the same root-space hinge as its rig", async () => {
    const lamp = await loadDeskLamp();

    expect(articulateDeskLampHead(lamp, ABOUT_LAMP_HEAD_QUATERNION)).toBe(true);
    lamp.updateWorldMatrix(true, true);
    const head = lamp.getObjectByName(DESK_LAMP_HEAD_NODE)!;
    const position = head.getWorldPosition(new THREE.Vector3());
    const quaternion = head.getWorldQuaternion(new THREE.Quaternion());

    position
      .toArray()
      .forEach((value, index) =>
        expect(value).toBeCloseTo(DESK_LAMP_HEAD_PIVOT[index]!, 8),
      );
    quaternion
      .toArray()
      .forEach((value, index) =>
        expect(value).toBeCloseTo(ABOUT_LAMP_HEAD_QUATERNION[index]!, 8),
      );
    expect(head.children).toHaveLength(2);
  });

  it("derives every aperture point and plane from the measured head axis", () => {
    expect(deskLampPointAlongAxis(0)).toEqual(DESK_LAMP_MOUTH);

    const apertureNormal = new THREE.Vector3(0, 0, 1).applyEuler(
      new THREE.Euler(DESK_LAMP_MOUTH_TILT, 0, 0),
    );
    const throwDirection = new THREE.Vector3(...deskLampPointAlongAxis(1))
      .sub(new THREE.Vector3(...DESK_LAMP_MOUTH))
      .normalize();

    expect(apertureNormal.dot(throwDirection)).toBeCloseTo(1, 8);
  });

  it("depth-clips the glow on an exact copy of the visible shade surface", async () => {
    const lamp = await loadDeskLamp();

    expect(
      articulateDeskLampHead(lamp, ABOUT_LAMP_HEAD_QUATERNION, {
        color: "#ffffff",
        opacity: 0.78,
      }),
    ).toBe(true);
    const shade = lamp.getObjectByName(DESK_LAMP_SHADE_NODE) as THREE.Mesh;
    const glow = lamp.getObjectByName(DESK_LAMP_SHADE_GLOW_NODE) as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;

    expect(shade).toBeInstanceOf(THREE.Mesh);
    expect(glow.parent).toBe(shade);
    expect(glow.geometry).not.toBe(shade.geometry);
    expect(Array.from(glow.geometry.attributes.position!.array)).toEqual(
      Array.from(shade.geometry.attributes.position!.array),
    );
    expect(glow.material.depthTest).toBe(true);
    expect(glow.material.depthFunc).toBe(THREE.EqualDepth);
    expect(glow.material.depthWrite).toBe(false);
    expect(glow.material.blending).toBe(THREE.AdditiveBlending);
    expect(glow.geometry.attributes.uv).toBeDefined();

    const map = glow.material.map as THREE.DataTexture;
    const pixels = map.image.data as Uint8Array;
    expect(map).toBeInstanceOf(THREE.DataTexture);
    expect(Array.from(pixels.slice(0, 3))).toEqual([255, 201, 138]);
    expect(
      Array.from(
        { length: pixels.length / 4 },
        (_, index) => pixels[index * 4 + 3],
      ).some((alpha) => alpha !== undefined && alpha >= 250),
    ).toBe(true);
  });

  it("retains the authored bulb-weighted shade ramp", () => {
    expect(deskLampShadeGlowStrength(0)).toBeCloseTo(0.06, 8);
    expect(deskLampShadeGlowStrength(0.29)).toBeCloseTo(1, 8);
    expect(deskLampShadeGlowStrength(1)).toBeCloseTo(0.02, 8);
  });

  it("keeps the articulated shade joined to the top of the support arm", async () => {
    const lamp = await loadDeskLamp();

    expect(articulateDeskLampHead(lamp, ABOUT_LAMP_HEAD_QUATERNION)).toBe(true);
    lamp.updateWorldMatrix(true, true);
    const head = lamp.getObjectByName(DESK_LAMP_HEAD_NODE)!;
    const headMeshIds = new Set<number>();
    const headTriangles: THREE.Triangle[] = [];
    head.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
      headMeshIds.add(mesh.id);
      headTriangles.push(...meshTriangles(mesh));
    });
    const armVertices: THREE.Vector3[] = [];
    lamp.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || headMeshIds.has(object.id)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
      armVertices.push(...meshVerticesAbove(mesh, 0.32));
    });

    expect(armVertices.length).toBeGreaterThan(0);
    expect(headTriangles.length).toBeGreaterThan(0);
    const closest = new THREE.Vector3();
    let seamGap = Infinity;
    for (const vertex of armVertices) {
      for (const triangle of headTriangles) {
        triangle.closestPointToPoint(vertex, closest);
        seamGap = Math.min(seamGap, vertex.distanceTo(closest));
      }
    }

    expect(seamGap).toBeLessThan(0.0015);
  });
});
