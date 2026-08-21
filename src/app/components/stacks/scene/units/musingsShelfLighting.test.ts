import {
  DESK_LAMP_HEAD_AXIS,
  DESK_LAMP_MOUTH,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
} from "../deskLampHead";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { PALETTES } from "../../theme";
import { localCameraFacingQuaternion } from "../heldFacingMath";
import { MUSINGS_PAPER_STACK } from "../musingsShelfGeometry";
import { packRow } from "../primitives";
import {
  MUSINGS_LAMP_HEAD_QUATERNION,
  MUSINGS_LAMP_HEAD_TARGET,
  MUSINGS_LAMP_ROOT_POSITION,
  MUSINGS_LAMP_ROOT_SCALE,
  MUSINGS_LAMP_ROOT_YAW,
  MUSINGS_OPEN_BOOK_POSE,
  MUSINGS_TEA_POSE,
} from "./musingsShelfLighting";

const unitSource = fs.readFileSync(
  new URL("./UnitBlog.tsx", import.meta.url),
  "utf8",
);
const objectsSource = fs.readFileSync(
  new URL("../objects.tsx", import.meta.url),
  "utf8",
);
const geometrySource = fs.readFileSync(
  new URL("../musingsShelfGeometry.ts", import.meta.url),
  "utf8",
);

async function loadModel(name: string) {
  const bytes = fs.readFileSync(
    path.resolve(process.cwd(), "public/models", name),
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

function poseModel(
  model: THREE.Object3D,
  pose: {
    base: readonly [number, number, number];
    rotation: readonly [number, number, number];
    scale: number;
  },
) {
  model.position.set(...pose.base);
  model.rotation.set(...pose.rotation);
  model.scale.setScalar(pose.scale);
  model.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(model, true);
}

describe("Musings shelf composition", () => {
  it("points the articulated lamp ray through the book-and-cup target", () => {
    const mouth = new THREE.Vector3(
      ...articulatedDeskLampPoint({
        point: DESK_LAMP_MOUTH,
        headQuaternion: MUSINGS_LAMP_HEAD_QUATERNION,
        rootPosition: MUSINGS_LAMP_ROOT_POSITION,
        rootYaw: MUSINGS_LAMP_ROOT_YAW,
        rootScale: MUSINGS_LAMP_ROOT_SCALE,
      }),
    );
    const target = new THREE.Vector3(
      MUSINGS_LAMP_ROOT_POSITION[0] + MUSINGS_LAMP_HEAD_TARGET[0],
      MUSINGS_LAMP_ROOT_POSITION[1] + MUSINGS_LAMP_HEAD_TARGET[1],
      MUSINGS_LAMP_ROOT_POSITION[2] + MUSINGS_LAMP_HEAD_TARGET[2],
    );
    const expected = target.sub(mouth).normalize();
    const actual = new THREE.Vector3(
      ...articulatedDeskLampDirection({
        direction: DESK_LAMP_HEAD_AXIS,
        headQuaternion: MUSINGS_LAMP_HEAD_QUATERNION,
        rootYaw: MUSINGS_LAMP_ROOT_YAW,
      }),
    );

    expect(actual.dot(expected)).toBeCloseTo(1, 10);
    expect(MUSINGS_LAMP_ROOT_YAW).toBeCloseTo(Math.atan2(0.56, 0.17), 10);
    expect(Math.abs(MUSINGS_LAMP_HEAD_QUATERNION[1])).toBeLessThan(1e-10);
    expect(Math.abs(MUSINGS_LAMP_HEAD_QUATERNION[2])).toBeLessThan(1e-10);
    expect(MUSINGS_LAMP_HEAD_QUATERNION).not.toEqual([0, 0, 0, 1]);
  });

  it("reuses the Books shelf's packed background volumes", () => {
    expect(unitSource).toContain("packRow(0.96, [], palette, 75)");
    expect(unitSource.match(/<BookRowMesh/g)).toHaveLength(2);
    expect(unitSource).toContain('kind: "flat"');
    expect(unitSource).toContain("grabbableVolumes");
    expect(unitSource).not.toContain("<RealBookPile");
    expect(unitSource).not.toContain("proxiedBookCover");
    expect(unitSource).not.toContain("<NotebookLean");
    expect(unitSource).not.toContain("<BookPile");
  });

  it("does not leave the end leaner propped against a short flat stack", () => {
    const row = packRow(0.96, [], PALETTES.dark, 75);
    expect(row.slice(-2).map((item) => item.kind)).not.toEqual([
      "flat",
      "lean",
    ]);
  });

  it("keeps the cup in front of the open book without an intersection", async () => {
    const [cup, book] = await Promise.all([
      loadModel("cup-tea.glb"),
      loadModel("open-book.glb"),
    ]);
    const cupBounds = poseModel(cup, MUSINGS_TEA_POSE);
    const bookBounds = poseModel(book, MUSINGS_OPEN_BOOK_POSE);

    expect(cupBounds.intersectsBox(bookBounds)).toBe(false);
    expect(cupBounds.min.z - bookBounds.max.z).toBeGreaterThan(0.009);
    expect(unitSource).toContain('hoverKey="egg:tea"');
    expect(unitSource).toContain("base={[...MUSINGS_TEA_POSE.base]}");
    expect(unitSource).toContain('hoverKey="grab:openbook"');
    expect(unitSource).toContain("base={[...MUSINGS_OPEN_BOOK_POSE.base]}");
  });

  it("maps all five source PDF pages onto thin paper", () => {
    expect(objectsSource).toContain("[5, 4, 3, 2, 1]");
    expect(objectsSource).toContain("gpt3-2021-page-${page}.webp");
    expect(geometrySource).toContain("sheetThickness: 0.0022");
    expect(objectsSource).toContain("map={texture}");
    expect(objectsSource).toContain("texture.rotation = -Math.PI / 2");
    expect(objectsSource).toContain("polygonOffsetFactor={-4}");
  });

  it("gives the paper a camera-facing carry and the pen its own physics", () => {
    expect(objectsSource).toContain(
      "heldFacingRotation={[Math.PI / 2, 0, 0]}",
    );
    expect(objectsSource).toContain(
      "heldMinRaise={MUSINGS_PAPER_STACK.heldClearance}",
    );
    expect(objectsSource).toContain('name="physics:musings-paper-stack"');
    expect(objectsSource).toContain('hoverKey={`grab:pen:${linkUnit}`}');

    const target = localCameraFacingQuaternion(
      new THREE.Quaternion(),
      new THREE.Quaternion(),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
      new THREE.Quaternion(),
    );
    const printedSide = new THREE.Vector3(0, 1, 0).applyQuaternion(target);
    const pageTop = new THREE.Vector3(0, 0, -1).applyQuaternion(target);
    expect(printedSide.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(
      1e-10,
    );
    expect(pageTop.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-10);

    const carried = new THREE.Mesh(
      new THREE.BoxGeometry(
        MUSINGS_PAPER_STACK.colliderWidth,
        MUSINGS_PAPER_STACK.colliderHeight,
        MUSINGS_PAPER_STACK.colliderDepth,
      ),
    );
    carried.position.y = MUSINGS_PAPER_STACK.heldClearance;
    carried.quaternion.copy(target);
    carried.updateWorldMatrix(true, true);
    expect(new THREE.Box3().setFromObject(carried).min.y).toBeGreaterThan(0);
  });

  it("sizes the lower stack as ordinary thin paperbacks", () => {
    expect(geometrySource).toContain("width: 0.4");
    expect(geometrySource).toContain("height: 0.034");
    expect(geometrySource).toContain("depth: 0.28");
    expect(unitSource).toContain("height: MUSINGS_LOWER_BOOK.height");
  });

  it("uses a lit, subdued sticker material", () => {
    const start = unitSource.indexOf("<meshStandardMaterial");
    const end = unitSource.indexOf("/>", start);
    const face = unitSource.slice(start, end);

    expect(face).toContain("map={texture}");
    expect(face).toContain("roughness={0.94}");
    expect(face).not.toContain("opacity=");
    expect(face).not.toContain("color=");
    expect(face).not.toContain("transparent");
  });
});
