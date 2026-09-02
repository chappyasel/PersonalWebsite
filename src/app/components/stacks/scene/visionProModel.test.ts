import { VISION_RIDE_HEADSET_PITCH } from "../visionRide/visionRideTransitionTimeline";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  createVisionProDisplayGeometry,
  createVisionProDisplayTexture,
  tuneVisionProMaterial,
  visionProDisplayPixel,
} from "./VisionProProp";
import { ABOUT_BOOT_MODEL_SILHOUETTES } from "./aboutBootSilhouettes";
import {
  DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS,
  createVisionProDisplayDiagnosticsController,
  resolveVisionProDisplayVariant,
} from "./visionProDisplayDiagnostics";
import {
  VISION_PRO_MODEL_SCALE,
  VISION_PRO_POSE,
  VISION_PRO_PROFILE,
} from "./visionProGeometry";

const MODEL = path.join(process.cwd(), "public/models/vision-pro.glb");
const MAX_MODEL_BYTES = 300 * 1024;

type GlbJson = {
  images?: Array<{ name?: string }>;
  materials?: Array<{
    name?: string;
    pbrMetallicRoughness?: { baseColorFactor?: number[] };
  }>;
};

function readGlbJson(): GlbJson {
  const bytes = fs.readFileSync(MODEL);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as GlbJson;
}

async function loadModel() {
  const bytes = fs.readFileSync(MODEL);
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

function transformedVertices(root: THREE.Object3D, meshName?: string) {
  root.updateWorldMatrix(true, true);
  const pose = new THREE.Matrix4().compose(
    new THREE.Vector3(0, VISION_PRO_POSE.seat, 0),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...VISION_PRO_POSE.rotation),
    ),
    new THREE.Vector3().setScalar(VISION_PRO_MODEL_SCALE),
  );
  const vertices: THREE.Vector3[] = [];
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      (meshName && object.name !== meshName)
    )
      return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
    const position = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const matrix = pose.clone().multiply(mesh.matrixWorld);
    for (let index = 0; index < position.count; index += 1) {
      vertices.push(
        new THREE.Vector3()
          .fromBufferAttribute(position, index)
          .applyMatrix4(matrix),
      );
    }
  });
  return vertices;
}

describe("Vision Pro web model", () => {
  it("keeps the trial display off and gives the visor a crisp reflective finish", () => {
    expect(DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS.enabled).toBe(false);
    expect(
      resolveVisionProDisplayVariant(DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS),
    ).toBe("dormant");
    const glass = new THREE.MeshStandardMaterial();
    glass.name = "Front Glass";

    tuneVisionProMaterial(glass, { dark: false });

    expect(glass.roughness).toBeLessThan(0.06);
    expect(glass.metalness).toBeCloseTo(0.66, 6);
    expect(glass.envMapIntensity).toBeCloseTo(3.25, 6);
  });

  it("can suppress the source model's rectangular demo display", () => {
    const display = new THREE.MeshStandardMaterial();
    display.name = "1708700653640";

    tuneVisionProMaterial(display, {
      dark: false,
      displayVariant: "dormant",
    });

    expect(display.visible).toBe(false);
  });

  it("turns the trial display on without letting it occlude the visor depth", () => {
    const display = new THREE.MeshStandardMaterial();
    display.name = "1708700653640";
    const texture = createVisionProDisplayTexture();

    tuneVisionProMaterial(display, {
      dark: false,
      displayVariant: "retrowave",
      displayTexture: texture,
    });

    expect(display.visible).toBe(true);
    expect(display.emissiveIntensity).toBeGreaterThan(0);
    expect(display.opacity).toBeLessThan(1);
    expect(display.transparent).toBe(true);
    expect(display.depthWrite).toBe(false);
    expect(display.map).toBe(texture);
    expect(display.emissiveMap).toBe(texture);
    texture.dispose();
  });

  it("masks the display into two colored lobes with a nose cutout", () => {
    const corner = visionProDisplayPixel(0, 0);
    const nose = visionProDisplayPixel(0.5, 0.2);
    const bridge = visionProDisplayPixel(0.5, 0.68);
    const left = visionProDisplayPixel(0.3, 0.55);
    const right = visionProDisplayPixel(0.7, 0.55);

    expect(corner[3]).toBe(0);
    expect(nose[3]).toBe(0);
    expect(bridge[3]).toBeGreaterThan(240);
    expect(left[3]).toBeGreaterThan(240);
    expect(right[3]).toBeGreaterThan(240);
    expect(left[0]).toBeGreaterThan(left[2]);
    expect(right[2]).toBeGreaterThan(right[0]);
  });

  it("renders coherent retrowave, 8-bit, and 16-bit display variants", () => {
    const retrowave = visionProDisplayPixel(0.34, 0.74, "retrowave");
    const eightBitA = visionProDisplayPixel(0.311, 0.72, "8-bit");
    const eightBitB = visionProDisplayPixel(0.312, 0.73, "8-bit");
    const sixteenBit = visionProDisplayPixel(0.34, 0.74, "16-bit");
    const dormant = visionProDisplayPixel(0.34, 0.74, "dormant");

    expect(retrowave[3]).toBeGreaterThan(240);
    expect(eightBitA.slice(0, 3)).toEqual(eightBitB.slice(0, 3));
    expect(sixteenBit.slice(0, 3)).not.toEqual(retrowave.slice(0, 3));
    expect(dormant).toEqual([0, 0, 0, 0]);
  });

  it("gives each authored room modifier a distinct front-display preview", () => {
    const point = [0.3, 0.28] as const;
    const night = visionProDisplayPixel(...point, "3:45");
    const redline = visionProDisplayPixel(...point, "redline");
    const golf = visionProDisplayPixel(...point, "golf");

    expect(new Set([night.join(), redline.join(), golf.join()]).size).toBe(3);
    expect(golf[1]).toBeGreaterThan(golf[0]);
    expect(redline[0]).toBeGreaterThan(redline[1]);
    expect(night[2]).toBeGreaterThan(night[0]);
  });

  it("keeps variant selection independent from the experimental enable gate", () => {
    const controller = createVisionProDisplayDiagnosticsController();
    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    controller.setVariant("16-bit");
    expect(controller.getSnapshot()).toEqual({
      enabled: false,
      variant: "16-bit",
    });
    expect(resolveVisionProDisplayVariant(controller.getSnapshot())).toBe(
      "dormant",
    );

    controller.setEnabled(true);
    expect(resolveVisionProDisplayVariant(controller.getSnapshot())).toBe(
      "16-bit",
    );
    expect(notifications).toBe(2);
  });

  it("uses nearest filtering for the pixel-treated textures", () => {
    const retrowave = createVisionProDisplayTexture("retrowave");
    const eightBit = createVisionProDisplayTexture("8-bit");
    const sixteenBit = createVisionProDisplayTexture("16-bit");

    expect(retrowave.magFilter).toBe(THREE.LinearFilter);
    expect(eightBit.magFilter).toBe(THREE.NearestFilter);
    expect(sixteenBit.magFilter).toBe(THREE.NearestFilter);
    expect(eightBit.generateMipmaps).toBe(false);

    retrowave.dispose();
    eightBit.dispose();
    sixteenBit.dispose();
  });

  it("projects UVs onto the source display primitive that ships without them", async () => {
    const model = await loadModel();
    let source: THREE.BufferGeometry | null = null;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.Material | THREE.Material[]
      >;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (materials.some((material) => material.name === "1708700653640"))
        source = mesh.geometry;
    });

    expect(source).not.toBeNull();
    expect(source!.getAttribute("uv")).toBeUndefined();
    const mapped = createVisionProDisplayGeometry(source!);
    const uv = mapped.getAttribute("uv") as THREE.BufferAttribute;
    const values = Array.from(uv.array);

    expect(Math.min(...values)).toBeCloseTo(0, 6);
    expect(Math.max(...values)).toBeCloseTo(1, 6);
    mapped.dispose();
  });

  it("stays within its shelf-prop transfer budget", () => {
    expect(fs.statSync(MODEL).size).toBeLessThanOrEqual(MAX_MODEL_BYTES);
  });

  it("does not ship the source archive's red fabric color map", () => {
    const model = readGlbJson();
    const imageNames = (model.images ?? []).map((image) => image.name ?? "");
    expect(imageNames).not.toContain("Fabric02_4K_BaseColor");

    const fabric = model.materials?.find(
      (material) => material.name === "Material.015",
    );
    expect(fabric?.pbrMetallicRoughness?.baseColorFactor).toEqual([
      0.45, 0.43, 0.4, 1,
    ]);
  });

  it("rests the rear band and front enclosure on the same shelf plane", async () => {
    const model = await loadModel();
    const minimum = (name: string) =>
      transformedVertices(model, name).sort((a, b) => a.y - b.y)[0]!;
    const rear = minimum("bandeau_haut");
    const front = minimum("front");
    const whole = new THREE.Box3().setFromPoints(transformedVertices(model));

    expect(rear.z).toBeLessThan(0);
    expect(front.z).toBeGreaterThan(0);
    expect(rear.y).toBeCloseTo(0, 10);
    expect(front.y).toBeCloseTo(0, 10);
    expect(whole.min.y).toBeCloseTo(0, 10);
  });

  it("raises the rear strap above the camera during the final wearing pitch", async () => {
    const model = await loadModel();
    const wearing = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -0.02, -0.135),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          VISION_RIDE_HEADSET_PITCH.wearing,
          Math.PI,
          0.025,
          "YXZ",
        ),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    const strapNearTheEye = transformedVertices(model, "bandeau_haut")
      .map((point) => point.applyMatrix4(wearing))
      .filter((point) => point.z > -0.1);

    expect(strapNearTheEye.length).toBeGreaterThan(0);
    expect(
      Math.min(...strapNearTheEye.map((point) => point.y)),
    ).toBeGreaterThan(0.03);
  });

  it("uses the posed model's traced front elevation during boot", () => {
    const silhouette = ABOUT_BOOT_MODEL_SILHOUETTES["vision-pro"];

    expect(silhouette.profile[0]).toBeCloseTo(VISION_PRO_PROFILE.width, 14);
    expect(silhouette.profile[1]).toBeCloseTo(VISION_PRO_PROFILE.height, 14);
    expect(silhouette.parts.band.length).toBeGreaterThan(100);
    expect(silhouette.parts.enclosure.length).toBeGreaterThan(100);
    expect(silhouette.parts.glass.length).toBeGreaterThan(100);
    expect(silhouette.path).toContain("C");
    expect(silhouette.parts.band).toContain("C");
    expect(silhouette.parts.enclosure).toContain("C");
    expect(silhouette.parts.glass).toContain("C");
  });

  it("expands the boot glass across nearly the whole front enclosure", () => {
    const silhouette = ABOUT_BOOT_MODEL_SILHOUETTES["vision-pro"];
    const glass = silhouette.parts.glass;
    const points = [
      ...glass.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g),
    ].map((match) => [Number(match[1]), Number(match[2])] as const);

    expect(Math.min(...points.map(([x]) => x))).toBeLessThanOrEqual(1.5);
    expect(Math.max(...points.map(([x]) => x))).toBeGreaterThanOrEqual(165);
    expect(Math.min(...points.map(([, y]) => y))).toBeLessThanOrEqual(0.5);
    expect(Math.max(...points.map(([, y]) => y))).toBeGreaterThanOrEqual(95.5);
  });
});
