import { PALETTES } from "../../theme";
import { articulateDeskLampHead } from "../ModelProp";
import {
  DESK_LAMP_HEAD_AXIS,
  DESK_LAMP_MOUTH,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
} from "../deskLampHead";
import { localCameraFacingQuaternion } from "../heldFacingMath";
import {
  MUSINGS_LOWER_LAYOUT,
  MUSINGS_PAPER_STACK,
  MUSINGS_TRUST_ESSAY,
} from "../musingsShelfGeometry";
import { bookRowXBounds, packRow } from "../primitives";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "../shelfGeometry";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { MUSINGS_SAND_TRAY } from "./SandTray";
import {
  MUSINGS_BOOK_ROW_BASE,
  MUSINGS_BOOK_ROW_SALT,
  MUSINGS_BOOK_ROW_WIDTH,
  MUSINGS_HEADPHONES_BASE,
  MUSINGS_KETTLE_POSE,
  MUSINGS_LAMP_HEAD_QUATERNION,
  MUSINGS_LAMP_HEAD_TARGET,
  MUSINGS_LAMP_ROOT_BASE,
  MUSINGS_LAMP_ROOT_POSITION,
  MUSINGS_LAMP_ROOT_SCALE,
  MUSINGS_LAMP_ROOT_YAW,
  MUSINGS_OPEN_BOOK_POSE,
  MUSINGS_TEA_HANDLE_POSITION,
  MUSINGS_TEA_POSE,
} from "./musingsShelfLighting";

const trustSource = fs.readFileSync(
  new URL("./TrustEssay.tsx", import.meta.url),
  "utf8",
);
const perchSource = fs.readFileSync(
  new URL("../insectPerches.tsx", import.meta.url),
  "utf8",
);
const unitSource = fs.readFileSync(
  new URL("./UnitBlog.tsx", import.meta.url),
  "utf8",
);
const sandTraySource = fs.readFileSync(
  new URL("./SandTray.tsx", import.meta.url),
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

function parseGlb(bytes: Buffer) {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as {
    images?: unknown[];
    textures?: unknown[];
    samplers?: unknown[];
    materials?: Array<{
      pbrMetallicRoughness?: { baseColorTexture?: unknown };
    }>;
  };
  const binHeader = 20 + jsonLength;
  const binLength = bytes.readUInt32LE(binHeader);
  const bin = bytes.subarray(binHeader + 8, binHeader + 8 + binLength);
  return { json, bin };
}

/** Node's GLTFLoader cannot decode embedded browser images. Geometry tests do
 * not need them, so rebuild the in-memory GLB without texture references while
 * checking the committed file's texture metadata separately below. */
function texturelessGlb(bytes: Buffer) {
  const { json, bin } = parseGlb(bytes);
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? [])
    if (material.pbrMetallicRoughness)
      delete material.pbrMetallicRoughness.baseColorTexture;
  let jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  jsonBytes = Buffer.concat([
    jsonBytes,
    Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20),
  ]);
  const binBytes = Buffer.concat([
    bin,
    Buffer.alloc((4 - (bin.length % 4)) % 4),
  ]);
  const output = Buffer.alloc(28 + jsonBytes.length + binBytes.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonBytes.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  output.writeUInt32LE(binBytes.length, 20 + jsonBytes.length);
  output.writeUInt32LE(0x004e4942, 24 + jsonBytes.length);
  binBytes.copy(output, 28 + jsonBytes.length);
  return output;
}

async function loadModel(name: string) {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "public/models", name),
  );
  const bytes = texturelessGlb(source);
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

function minimumVertexDistance(model: THREE.Object3D, point: THREE.Vector3) {
  let minimum = Infinity;
  const vertex = new THREE.Vector3();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
    const position = mesh.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
      vertex
        .fromBufferAttribute(position, index)
        .applyMatrix4(mesh.matrixWorld);
      minimum = Math.min(minimum, vertex.distanceTo(point));
    }
  });
  return minimum;
}

function topFootprintsOverlap(a: THREE.Box3, b: THREE.Box3) {
  return !(
    a.max.x <= b.min.x ||
    b.max.x <= a.min.x ||
    a.max.z <= b.min.z ||
    b.max.z <= a.min.z
  );
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
    expect(MUSINGS_LAMP_ROOT_YAW).toBeCloseTo(
      Math.atan2(MUSINGS_LAMP_HEAD_TARGET[0], MUSINGS_LAMP_HEAD_TARGET[2]),
      10,
    );
    expect(Math.abs(MUSINGS_LAMP_HEAD_QUATERNION[1])).toBeLessThan(1e-10);
    expect(Math.abs(MUSINGS_LAMP_HEAD_QUATERNION[2])).toBeLessThan(1e-10);
    expect(MUSINGS_LAMP_HEAD_QUATERNION).not.toEqual([0, 0, 0, 1]);
  });

  it("reuses the Books shelf's packed background volumes", () => {
    expect(unitSource).toContain("MUSINGS_BOOK_ROW_WIDTH");
    expect(unitSource).toContain("MUSINGS_BOOK_ROW_SALT");
    // One packed row now: the upright spines on the top shelf. The lower
    // shelf's three anonymous flat books gave way to the Trust essay on
    // 2026-08-22.
    expect(unitSource.match(/<BookRowMesh/g)).toHaveLength(1);
    expect(unitSource).not.toContain('kind: "flat"');
    expect(unitSource).toContain("grabbableVolumes");
    expect(unitSource).not.toContain("<RealBookPile");
    expect(unitSource).not.toContain("proxiedBookCover");
    expect(unitSource).not.toContain("<NotebookLean");
    expect(unitSource).not.toContain("<BookPile");
  });

  it("does not leave the end leaner propped against a short flat stack", () => {
    const row = packRow(
      MUSINGS_BOOK_ROW_WIDTH,
      [],
      PALETTES.dark,
      MUSINGS_BOOK_ROW_SALT,
    );
    expect(row.slice(-2).map((item) => item.kind)).not.toEqual([
      "flat",
      "lean",
    ]);
  });

  it("restages the cup and open book without an intersection", async () => {
    const [cup, book] = await Promise.all([
      loadModel("cup-tea.glb"),
      loadModel("open-book.glb"),
    ]);
    const cupBounds = poseModel(cup, MUSINGS_TEA_POSE);
    const bookBounds = poseModel(book, MUSINGS_OPEN_BOOK_POSE);

    expect(cupBounds.intersectsBox(bookBounds)).toBe(false);
    expect(MUSINGS_OPEN_BOOK_POSE.base[2]).toBeCloseTo(-0.1, 10);
    expect(MUSINGS_TEA_POSE.base[2]).toBeCloseTo(0.27, 10);
    expect(
      MUSINGS_OPEN_BOOK_POSE.base[0] - MUSINGS_TEA_POSE.base[0],
    ).toBeGreaterThanOrEqual(0.2);
    expect(unitSource).toContain('hoverKey="egg:tea"');
    expect(unitSource).toContain("base={[...MUSINGS_TEA_POSE.base]}");
    expect(unitSource).toContain('hoverKey="grab:openbook"');
    expect(unitSource).toContain("base={[...MUSINGS_OPEN_BOOK_POSE.base]}");
  });

  it("packs the complete top shelf from measured footprints", async () => {
    const [cup, kettle, book, headphones, lamp] = await Promise.all([
      loadModel("cup-tea.glb"),
      loadModel("kettle.glb"),
      loadModel("open-book.glb"),
      loadModel("headphones.glb"),
      loadModel("desk-lamp.glb"),
    ]);
    const cupBounds = poseModel(cup, MUSINGS_TEA_POSE);
    const kettleBounds = poseModel(kettle, MUSINGS_KETTLE_POSE);
    const bookBounds = poseModel(book, MUSINGS_OPEN_BOOK_POSE);
    const headphoneBounds = poseModel(headphones, {
      base: MUSINGS_HEADPHONES_BASE,
      rotation: [0, -1.07, 0],
      scale: 0.36,
    });
    expect(articulateDeskLampHead(lamp, MUSINGS_LAMP_HEAD_QUATERNION)).toBe(
      true,
    );
    const lampBounds = poseModel(lamp, {
      base: MUSINGS_LAMP_ROOT_BASE,
      rotation: [0, MUSINGS_LAMP_ROOT_YAW, 0],
      scale: MUSINGS_LAMP_ROOT_SCALE,
    });
    const row = bookRowXBounds(
      packRow(MUSINGS_BOOK_ROW_WIDTH, [], PALETTES.dark, MUSINGS_BOOK_ROW_SALT),
    );
    const rowLeft = MUSINGS_BOOK_ROW_BASE[0] + row.min;
    const rowRight = MUSINGS_BOOK_ROW_BASE[0] + row.max;

    expect(kettleBounds.max.z).toBeLessThan(cupBounds.min.z);
    expect(kettleBounds.intersectsBox(lampBounds)).toBe(false);
    expect(topFootprintsOverlap(kettleBounds, bookBounds)).toBe(false);
    expect(topFootprintsOverlap(cupBounds, bookBounds)).toBe(false);
    expect(kettleBounds.max.y).toBeGreaterThan(cupBounds.max.y);
    expect(kettleBounds.getSize(new THREE.Vector3()).x).toBeGreaterThanOrEqual(
      cupBounds.getSize(new THREE.Vector3()).x * 1.45,
    );
    expect(kettleBounds.getSize(new THREE.Vector3()).x).toBeLessThanOrEqual(
      cupBounds.getSize(new THREE.Vector3()).x * 1.75,
    );
    expect(rowRight).toBeCloseTo(SHELF_GEOMETRY.width / 2 - 0.06, 10);
    expect(rowLeft - bookBounds.max.x).toBeCloseTo(0.025, 10);
    expect(headphoneBounds.max.x).toBeLessThan(SHELF_GEOMETRY.width / 2);
    expect(unitSource).toContain('url="/models/kettle.glb"');
    expect(unitSource).toContain('hoverKey="grab:kettle"');
    expect(unitSource).toContain('variant="tinted"');
    const kettleJson = parseGlb(
      fs.readFileSync(path.resolve(process.cwd(), "public/models/kettle.glb")),
    ).json;
    expect(kettleJson.images).toHaveLength(1);
    expect(
      kettleJson.materials?.some(
        (material) => material.pbrMetallicRoughness?.baseColorTexture,
      ),
    ).toBe(true);
  });

  it("stands the headphones on the generated two-book stack", () => {
    const row = packRow(
      MUSINGS_BOOK_ROW_WIDTH,
      [],
      PALETTES.dark,
      MUSINGS_BOOK_ROW_SALT,
    );
    const flat = row.find((item) => item.kind === "flat");
    expect(flat?.kind).toBe("flat");
    if (flat?.kind !== "flat") return;
    expect(flat.n).toBe(2);
    expect(MUSINGS_HEADPHONES_BASE[0]).toBeCloseTo(
      MUSINGS_BOOK_ROW_BASE[0] +
        flat.x +
        (flat.n - 1) * (flat.staggerX ?? 0.012),
      10,
    );
    expect(MUSINGS_HEADPHONES_BASE[1]).toBeCloseTo(
      flat.n * (flat.height ?? 0.052),
      10,
    );
  });

  it("carries the wood-rimmed sand tray in the lighthouse rigid body", () => {
    const lighthouseStart = unitSource.indexOf(
      'hoverKey="grab:lighthouse:musings"',
    );
    const lighthouseEnd = unitSource.indexOf("</Grabbable>", lighthouseStart);
    const lighthouseCarrier = unitSource.slice(lighthouseStart, lighthouseEnd);
    expect(lighthouseCarrier).toContain("<SandTray");
    expect(lighthouseCarrier).toContain("tiltOnHover={false}");
    expect(lighthouseCarrier).toContain("tiltWhileHeld={false}");
    expect(lighthouseCarrier).not.toContain("setLighthouseMoved");
    expect(unitSource.slice(0, lighthouseStart)).not.toContain("<SandTray");
    expect(sandTraySource).not.toContain("physicsIgnore: true");
    expect(sandTraySource).toContain("<cylinderGeometry");
    expect(sandTraySource).toContain("<WoodMaterial");
    expect(sandTraySource).toContain("MUSINGS_SAND_TRAY.baseThickness / 2");
  });

  it("puts the tea landing contact on the handle outside the bowl", async () => {
    const dx = MUSINGS_TEA_HANDLE_POSITION[0] - MUSINGS_TEA_POSE.base[0];
    const dz = MUSINGS_TEA_HANDLE_POSITION[2] - MUSINGS_TEA_POSE.base[2];
    // The bowl's measured outer rim radius is 0.0366 source units. At the
    // live 2.4 scale it ends at 0.0878; this contact is beyond it.
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.1);
    const cup = await loadModel("cup-tea.glb");
    poseModel(cup, MUSINGS_TEA_POSE);
    const modelSpaceContact = new THREE.Vector3(...MUSINGS_TEA_HANDLE_POSITION);
    modelSpaceContact.y -= SHELF_SURFACE.top;
    expect(minimumVertexDistance(cup, modelSpaceContact)).toBeLessThan(0.015);
    expect(perchSource).toContain('id: "musings:tea-handle"');
    expect(perchSource).not.toContain('id: "musings:tea-rim"');
  });

  it("spaces every lower-shelf footprint without overlaps or dead gaps", () => {
    const footprints = [
      [MUSINGS_LOWER_LAYOUT.plantX, 0.27],
      [MUSINGS_LOWER_LAYOUT.mugX, 0.22],
      [MUSINGS_LOWER_LAYOUT.paperX, MUSINGS_PAPER_STACK.colliderWidth],
      [MUSINGS_LOWER_LAYOUT.trustX, MUSINGS_TRUST_ESSAY.width],
      [MUSINGS_LOWER_LAYOUT.signX, 0.22],
      [MUSINGS_LOWER_LAYOUT.cutoutX, 0.46],
      [MUSINGS_LOWER_LAYOUT.lighthouseX, MUSINGS_SAND_TRAY.radius * 2],
    ] as const;
    const leftEdge = -SHELF_GEOMETRY.width / 2;
    const rightEdge = SHELF_GEOMETRY.width / 2;

    expect(footprints[0][0] - footprints[0][1] / 2 - leftEdge).toBeGreaterThan(
      0.025,
    );
    for (let index = 1; index < footprints.length; index++) {
      const previous = footprints[index - 1]!;
      const current = footprints[index]!;
      const gap = current[0] - current[1] / 2 - (previous[0] + previous[1] / 2);
      expect(gap).toBeGreaterThan(0.02);
      expect(gap).toBeLessThan(0.024);
    }
    const last = footprints[footprints.length - 1]!;
    expect(rightEdge - (last[0] + last[1] / 2)).toBeGreaterThan(0.02);
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
    expect(objectsSource).toContain("heldFacingRotation={[Math.PI / 2, 0, 0]}");
    expect(objectsSource).toContain(
      "heldMinRaise={MUSINGS_PAPER_STACK.heldClearance}",
    );
    expect(objectsSource).toContain('name="physics:musings-paper-stack"');
    expect(objectsSource).toContain("hoverKey={`grab:pen:${linkUnit}`}");

    const target = localCameraFacingQuaternion(
      new THREE.Quaternion(),
      new THREE.Quaternion(),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
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

  it("stands the Trust essay on its reading stand where the flat stack was", () => {
    // Full Letter proportions shared with the loose GPT-3 pages, on a stand,
    // reclined. The flat stack's depth is the portrait booklet's width.
    expect(geometrySource).toContain("width: MUSINGS_PAPER_STACK.depth");
    expect(geometrySource).toContain("height: MUSINGS_PAPER_STACK.width");
    expect(geometrySource).toContain("thickness: 0.008");
    expect(geometrySource).toContain("lean: 0.35");
    expect(unitSource).toContain("<TrustEssay");
    expect(unitSource).not.toContain("MUSINGS_LOWER_BOOK");
    // The booklet is a Door to the essay, and the perch rides the cover.
    expect(trustSource).toContain("href={TRUST_ESSAY_HREF}");
    expect(trustSource).toContain(
      "/images/stacks/musings/trust-2025-cover.webp",
    );
    expect(perchSource).toContain('id: "musings:trust-cover"');
  });

  it("colors the selected headphones Beats red", () => {
    expect(unitSource).toContain('GrayTone1: "#aa1630"');
    expect(unitSource).toContain("GrayTone1: { roughness: 0.72 }");
    expect(unitSource).toContain("tints={HEADPHONE_TINTS");
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
