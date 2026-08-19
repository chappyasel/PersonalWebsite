import { ABOUT_BOOT_LANDMARKS } from "../aboutBootComposition";
import {
  diagnoseInsectPerch,
  registerInsectCollisionRoot,
} from "../insectFlightWorld";
import {
  type InsectPerch,
  insectPerchCatalog,
  registerInsectPerch,
} from "../insectPerches";
import { registerSceneInteraction } from "../interactionRegistry";
import {
  extractTriangles,
  findIslands,
  findSphereIsland,
  findSpinAxis,
  partitionTrianglesByOctant,
} from "../islands";
import { registerMeadowLamp } from "../meadowLights";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "../shelfGeometry";
import { unitPose } from "../worldLayout";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { afterEach, describe, expect, it } from "vitest";

const disposables: Array<{ dispose(): void }> = [];

afterEach(() => {
  for (const disposable of disposables.splice(0)) disposable.dispose();
});

function visibleMaterial() {
  const material = new THREE.MeshBasicMaterial();
  disposables.push(material);
  return material;
}

function box(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
) {
  const geometry = new THREE.BoxGeometry(...size);
  disposables.push(geometry);
  const mesh = new THREE.Mesh(geometry, visibleMaterial());
  mesh.position.set(...position);
  return mesh;
}

async function loadModel(name: "globe" | "desk-lamp") {
  const bytes = fs.readFileSync(
    path.resolve(process.cwd(), `public/models/${name}.glb`),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return (await loader.parseAsync(buffer, "")).scene;
}

/** Exact connectivity split used by ModelProp's `spinPart="sphere"`. The
 * fixture needs the live ball-only rotation because its changing AABB is the
 * collision-refresh stressor reported by the HUD. */
function splitGlobeBall(root: THREE.Object3D) {
  let source: THREE.Mesh<THREE.BufferGeometry> | null = null;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh)
      source = object as THREE.Mesh<THREE.BufferGeometry>;
  });
  if (!source) throw new Error("Globe fixture has no mesh");
  const mesh = source as THREE.Mesh<THREE.BufferGeometry>;
  const islands = findIslands(mesh.geometry);
  const total = islands.reduce(
    (count, island) => count + island.triangles.length,
    0,
  );
  const ball = findSphereIsland(islands, total);
  if (!ball) throw new Error("Globe fixture has no spherical island");
  const rest = islands
    .filter((island) => island !== ball)
    .flatMap((island) => island.triangles)
    .sort((a, b) => a - b);
  const { axis } = findSpinAxis(islands, ball);
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis,
  );
  const inverseAlign = align.clone().invert();
  const ballGeometries = partitionTrianglesByOctant(
    mesh.geometry,
    ball.triangles,
    ball.center,
    inverseAlign,
  ).map((triangles) =>
    extractTriangles(mesh.geometry, triangles, ball.center, inverseAlign),
  );
  const restGeometry = extractTriangles(mesh.geometry, rest);
  disposables.push(...ballGeometries, restGeometry);
  const spin = new THREE.Group();
  const ballMeshes = ballGeometries.map((geometry) => {
    const ballMesh = new THREE.Mesh(geometry, mesh.material);
    spin.add(ballMesh);
    return ballMesh;
  });
  const mount = new THREE.Group();
  mount.position.copy(ball.center);
  mount.quaternion.copy(align);
  mount.add(spin);
  mesh.geometry = restGeometry;
  mesh.add(mount);
  return { spin, ballMeshes, restMesh: mesh };
}

function collectiveMarkGeometry() {
  const source = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "public/images/stacks/v8/ai-collective-mark.svg",
    ),
    "utf8",
  );
  // SVGLoader only needs this tiny DOM surface for the source's three plain
  // path nodes. Keeping the harness headless avoids introducing jsdom solely
  // to parse one checked-in geometry asset.
  type SvgNode = {
    nodeType: number;
    nodeName: string;
    childNodes: SvgNode[];
    style: Record<string, string>;
    hasAttribute(name: string): boolean;
    getAttribute(name: string): string;
  };
  const node = (
    nodeName: string,
    attributes: Record<string, string>,
  ): SvgNode => ({
    nodeType: 1,
    nodeName,
    childNodes: [],
    style: {},
    hasAttribute: (name) => Object.hasOwn(attributes, name),
    getAttribute: (name) => attributes[name] ?? "",
  });
  const root = node("svg", {});
  for (const match of source.matchAll(/<path\s+([^>]+)\/>/g)) {
    const attributes: Record<string, string> = {};
    for (const attribute of match[1]!.matchAll(/([\w-]+)="([^"]*)"/g))
      attributes[attribute[1]!] = attribute[2]!;
    root.childNodes.push(node("path", attributes));
  }
  const previousParser = globalThis.DOMParser;
  class HeadlessSvgParser {
    parseFromString() {
      return {
        documentElement: root,
        querySelectorAll: () => [],
      };
    }
  }
  globalThis.DOMParser = HeadlessSvgParser as unknown as typeof DOMParser;
  const svg = new SVGLoader().parse(source);
  globalThis.DOMParser = previousParser;
  const shapes = svg.paths.flatMap((svgPath) => svgPath.toShapes());
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 72,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 9,
    bevelThickness: 9,
    curveSegments: 4,
  });
  const scale = 0.18 / 844.38;
  geometry.scale(scale, scale, scale);
  geometry.rotateX(Math.PI);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  geometry.translate(
    -(bounds.min.x + bounds.max.x) / 2,
    -(bounds.min.y + bounds.max.y) / 2,
    -(bounds.min.z + bounds.max.z) / 2,
  );
  geometry.computeVertexNormals();
  disposables.push(geometry);
  return geometry;
}

async function mountAboutPerchFixture() {
  const scene = new THREE.Scene();
  const unit = new THREE.Group();
  const pose = unitPose(0);
  unit.position.set(...pose.position);
  unit.rotation.set(...pose.rotation);
  scene.add(unit);

  for (const shelf of [SHELF_GEOMETRY.top, SHELF_GEOMETRY.lower])
    unit.add(
      box(
        [SHELF_GEOMETRY.width, shelf.thickness, shelf.depth],
        [0, shelf.centerY, shelf.centerZ],
      ),
    );

  const owners = new Map<string, THREE.Group>();
  const registerOwner = (id: string, owner: THREE.Group) => {
    owners.set(id, owner);
    return registerSceneInteraction({ id, root: owner, activeUnits: [0] });
  };

  const aic = new THREE.Group();
  aic.position.set(
    ABOUT_BOOT_LANDMARKS["ai-collective"].x,
    SHELF_SURFACE.lower,
    SHELF_GEOMETRY.lower.centerZ,
  );
  const aicPose = new THREE.Group();
  aicPose.rotation.y = -0.16;
  aicPose.add(box([0.205, 0.024, 0.07], [0, 0.012, 0]));
  const mark = new THREE.Mesh(collectiveMarkGeometry(), visibleMaterial());
  mark.position.set(0, 0.118, 0.004);
  mark.rotation.set(0, 0.04, 0);
  aicPose.add(mark);
  const shimmerMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
  });
  disposables.push(shimmerMaterial);
  const shimmer = new THREE.Mesh(mark.geometry, shimmerMaterial);
  shimmer.position.set(0, 0.118, 0.005);
  shimmer.rotation.set(0, 0.04, 0);
  shimmer.scale.setScalar(1.003);
  aicPose.add(shimmer);
  aic.add(aicPose);
  unit.add(aic);

  const portrait = new THREE.Group();
  portrait.position.set(ABOUT_BOOT_LANDMARKS.portrait.x, SHELF_SURFACE.top, 0);
  const portraitScale = new THREE.Group();
  portraitScale.scale.setScalar(ABOUT_BOOT_LANDMARKS.portrait.sceneScale);
  const portraitPose = new THREE.Group();
  portraitPose.position.set(0, 0.62, -0.08);
  portraitPose.rotation.set(-0.06, 0.06, 0);
  portraitPose.add(box([1.02, 1.24, 0.04], [0, 0, -0.024]));
  portraitPose.add(box([0.94, 1.16, 0.0002], [0, 0, -0.002]));
  portraitScale.add(portraitPose);
  portrait.add(portraitScale);
  unit.add(portrait);

  const globe = new THREE.Group();
  globe.position.set(ABOUT_BOOT_LANDMARKS.globe.x, SHELF_SURFACE.top, 0.02);
  const globeModel = await loadModel("globe");
  globeModel.rotation.y = -0.7;
  globeModel.scale.setScalar(ABOUT_BOOT_LANDMARKS.globe.sceneScale);
  const globeParts = splitGlobeBall(globeModel);
  globe.add(globeModel);
  unit.add(globe);

  const lampCarrier = new THREE.Group();
  lampCarrier.position.set(
    ABOUT_BOOT_LANDMARKS["desk-lamp"].x,
    SHELF_SURFACE.lower,
    -0.06,
  );
  const lampPose = new THREE.Group();
  lampPose.rotation.y = 0.78;
  lampPose.scale.setScalar(ABOUT_BOOT_LANDMARKS["desk-lamp"].sceneScale);
  const lamp = new THREE.Group();
  lamp.add(await loadModel("desk-lamp"));
  lampPose.add(lamp);
  lampCarrier.add(lampPose);
  unit.add(lampCarrier);

  // The TJ medallion: a disc standing on a small base, with the Perch on its
  // top rim. Bounds are the live collision index's, in Unit-local terms.
  const medallion = new THREE.Group();
  medallion.add(box([0.144, 0.025, 0.176], [-0.24, -0.8295, -0.08]));
  medallion.add(box([0.212, 0.216, 0.052], [-0.24, -0.697, -0.08]));
  unit.add(medallion);

  // The frontmost book of the reading stack, stood on the lower shelf.
  const otherMinds = new THREE.Group();
  otherMinds.add(box([0.272, 0.496, 0.242], [0.69, -0.595, 0.151]));
  unit.add(otherMinds);

  // ...and the rearmost, which took over the About shelf's seventh Perch from
  // the globe crown. Bounds measured off the live scene like the rest.
  const behave = new THREE.Group();
  behave.add(box([0.309, 0.495, 0.25], [0.33, -0.5945, 0.035]));
  unit.add(behave);

  // The family frame, standing on the top plank. Bounds measured off the live
  // scene, like everything else in this fixture.
  const familyFrame = new THREE.Group();
  familyFrame.add(box([0.2422, 0.3209, 0.1111], [0.4782, 0.1904, 0.0912]));
  unit.add(familyFrame);

  const releases = [
    registerOwner("grab:ai-collective-mark", aic),
    // `LoosePhoto` registers `grab:photo:<id>`. This fixture used to register
    // `link:photo:portrait` — the id the Perch table named — which made the
    // suite agree with the catalog about an owner the real Unit has never
    // registered, and kept a permanently rejected Perch green in every test
    // while it showed red on the page.
    registerOwner("grab:photo:portrait", portrait),
    registerOwner("grab:tj-medallion:about", medallion),
    registerOwner("grab:reading:other-minds", otherMinds),
    registerOwner("grab:reading:behave", behave),
    registerOwner("grab:photo:about-family-v8", familyFrame),
    registerOwner("egg:globe", globe),
    registerOwner("egg:lamp:0", lamp),
    registerInsectCollisionRoot(0, unit),
    registerMeadowLamp("desk-lamp-0", {
      x: 0,
      y: 0,
      z: 0,
      radius: 1,
      strength: 1,
      litRef: { current: 1 },
      sourceX: 0,
      sourceY: 0,
      sourceZ: 0,
      coneTargetX: 0,
      coneTargetY: -1,
      coneTargetZ: 0,
      mothCount: 2,
      mothNearDistance: 0.18,
      mothFarDistance: 0.74,
      mothMaxRadius: 0.72,
    }),
  ];

  for (const definition of insectPerchCatalog()[0]!) {
    const anchor = new THREE.Object3D();
    anchor.position.set(...definition.position);
    unit.add(anchor);
    const lampId = definition.lampId ?? null;
    const perch: InsectPerch = {
      id: definition.id,
      unitIndex: 0,
      kind: lampId ? "lamp" : "perch",
      ownerId: definition.ownerId ?? null,
      ownerPrefix: definition.ownerPrefix ?? null,
      lampId,
      clearance: definition.clearance ?? 0.12,
      tangent: definition.tangent ?? null,
      contactDistanceTolerance: definition.contactDistanceTolerance ?? null,
      normalTolerance: definition.normalTolerance ?? 0.3,
      anchor,
      normal: definition.normal ?? [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(0, 1, 0),
    };
    releases.push(registerInsectPerch(perch));
  }
  unit.updateWorldMatrix(true, true);
  return { globeSpin: globeParts.spin, releases };
}

describe("Unit About authored Perches", () => {
  it("keeps every real About support valid across animated collision refreshes", async () => {
    const { globeSpin, releases } = await mountAboutPerchFixture();
    const trace = new Map<string, string[]>();
    try {
      for (let refresh = 0; refresh < 48; refresh++) {
        const now = refresh * 0.21;
        globeSpin.rotation.y = (refresh / 48) * Math.PI * 2;
        globeSpin.updateWorldMatrix(true, true);
        for (const definition of insectPerchCatalog()[0]!) {
          const species = "lampId" in definition ? "moth" : "butterfly";
          const diagnostic = diagnoseInsectPerch(definition.id, species, now);
          const samples = trace.get(definition.id) ?? [];
          samples.push(diagnostic.rejectionCode);
          trace.set(definition.id, samples);
        }
      }
      const uniqueCodes = Object.fromEntries(
        [...trace].map(([perchId, samples]) => [
          perchId,
          [...new Set(samples)],
        ]),
      );
      expect(uniqueCodes).toEqual(
        Object.fromEntries(
          insectPerchCatalog()[0]!.map((definition) => [
            definition.id,
            ["none"],
          ]),
        ),
      );
    } finally {
      for (const release of releases.reverse()) release();
    }
  });
});
