import {
  ABOUT_BOOT_LANDMARKS,
  aboutLandmarkNodeName,
} from "../scene/aboutBootComposition";
import { projectAboutBootPoint } from "../scene/aboutBootPerspective";
import { SHELF_PLANKS, SHELF_SURFACE } from "../scene/shelfGeometry";
import {
  Matrix4,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  Vector3,
} from "three";

import { aboutIllustrationProjection } from "./aboutProjection";
import type { RoomArtworkRegistration } from "./artwork";
import {
  type Rectangle,
  artworkPoint,
  cssPoint,
  rebaseProjection,
} from "./projection";
import { capturedMeshPath, restWorldMatrix } from "./restTransforms";

export type RegisteredShelf = {
  world: Matrix4;
  projection: Matrix4;
  meshes: Map<Mesh, Matrix4>;
  residuals: { id: string; px: number }[];
};

export class ShelfNotMountedError extends Error {
  readonly name = "ShelfNotMountedError";
}

/** Geometry loaded correctly, but this saved view cannot align at this size. */
export class ShelfAlignmentError extends Error {
  readonly name = "ShelfAlignmentError";
  constructor(readonly residuals: RegisteredShelf["residuals"]) {
    super(
      `Shelf registration exceeds 3px (${Math.max(...residuals.map(({ px }) => px)).toFixed(2)}px)`,
    );
  }
}

function requireMatch(residuals: RegisteredShelf["residuals"]) {
  if (
    residuals.length < 7 ||
    residuals.some(({ px }) => !Number.isFinite(px))
  ) {
    throw new Error("Shelf registration has incomplete projection evidence");
  }
  if (residuals.some(({ px }) => px > 3))
    throw new ShelfAlignmentError(residuals);
}

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Validate saved identities before projecting mounted geometry. No renderer or target allocation. */
export async function registerCapturedShelf(
  unit: Object3D,
  source: RoomArtworkRegistration,
  box: Rectangle,
  viewport: Rectangle,
  dataIdentity?: string,
  restCamera?: PerspectiveCamera,
): Promise<RegisteredShelf> {
  if (!source.registrationAvailable || !source.unitWorld)
    throw new Error(
      source.registrationUnavailableReason ??
        "Capture has no registration evidence",
    );
  if (
    source.requiresDataIdentity &&
    (!source.capturedDataSha256 || source.capturedDataSha256 !== dataIdentity)
  )
    throw new Error(
      "The saved drawing cannot verify the current book selection",
    );
  const rotations = new Map(
    source.liveRotations.map((entry) => [entry.name, entry.rotation] as const),
  );
  const cache = new Map<Object3D, Matrix4>();
  const inverseUnit = restWorldMatrix(unit, cache, rotations).clone().invert();
  const paths = new Map<string, Mesh>();
  unit.traverse((node) => {
    if (node instanceof Mesh) {
      paths.set(capturedMeshPath(node, unit), node as Mesh);
      // Desktop captures predate the clock hand's stable name; phone captures include it.
      paths.set(capturedMeshPath(node, unit, true), node as Mesh);
    }
  });
  const meshes = new Map<Mesh, Matrix4>();
  for (const owner of source.owners) {
    const local: number[][] = [];
    const identities: { path: string; node: string; type: string }[] = [];
    for (const path of owner.paths) {
      const mesh = paths.get(path);
      if (!mesh) throw new ShelfNotMountedError(`Missing saved mesh: ${path}`);
      const rest = restWorldMatrix(mesh, cache, rotations).clone();
      meshes.set(mesh, rest);
      local.push(
        inverseUnit
          .clone()
          .multiply(rest)
          .toArray()
          .map((value) => Number(value.toFixed(6))),
      );
      identities.push({ path, node: mesh.name, type: mesh.geometry.type });
    }
    const [pose, identity] = await Promise.all([
      sha256(local),
      sha256(identities),
    ]);
    if (pose !== owner.poseSha256 || identity !== owner.geometryIdentitySha256)
      throw new Error(`Saved mesh identity changed: ${owner.id}`);
  }
  const captureWorld = new Matrix4().fromArray(source.camera.world);
  const world = restCamera?.matrixWorld.clone() ?? captureWorld;
  const capturedProjection = new Matrix4().fromArray(source.camera.projection);
  const projection =
    restCamera?.projectionMatrix.clone() ??
    rebaseProjection(
      source.camera.projection,
      source.raster,
      source.viewBox,
      box,
      viewport,
    );
  const capturedUnit = new Matrix4().fromArray(source.unitWorld);
  const residuals = source.probes.map((probe) => {
    const mesh = paths.get(probe.path);
    const rest = mesh && meshes.get(mesh);
    if (!mesh || !rest || mesh.geometry.type !== probe.geometryType)
      throw new Error(`Missing registration probe: ${probe.id}`);
    const point = new Vector3().fromArray(probe.sample.coordinates);
    if (probe.sample.kind === "bounds" && !probe.capturedCoordinates)
      throw new Error(`Missing captured point: ${probe.id}`);
    const capturePoint = new Vector3().fromArray(
      probe.capturedCoordinates ?? probe.sample.coordinates,
    );
    if (probe.sample.kind === "bounds") {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox!;
      point.set(
        bounds.min.x + (bounds.max.x - bounds.min.x) * point.x,
        bounds.min.y + (bounds.max.y - bounds.min.y) * point.y,
        bounds.min.z + (bounds.max.z - bounds.min.z) * point.z,
      );
    }
    capturePoint
      .applyMatrix4(new Matrix4().fromArray(probe.localMatrix))
      .applyMatrix4(capturedUnit);
    const pixel = cssPoint(capturePoint, captureWorld, capturedProjection, {
      x: 0,
      y: 0,
      width: source.raster[0]!,
      height: source.raster[1]!,
    });
    const expected = artworkPoint(pixel, source.viewBox, box);
    const actual = cssPoint(
      point.applyMatrix4(rest),
      world,
      projection,
      viewport,
    );
    return {
      id: probe.id,
      px: Math.hypot(expected[0]! - actual[0]!, expected[1]! - actual[1]!),
    };
  });
  requireMatch(residuals);
  return { world, projection, meshes, residuals };
}

/** About retains its projected drawing, live covers, and authored floor props. */
export function registerAboutShelf(
  unit: Object3D,
  box: Rectangle,
  viewport: Rectangle,
  restCamera?: PerspectiveCamera,
): RegisteredShelf {
  const structure = unit.getObjectByName("shelf-structure:0");
  if (!structure?.parent)
    throw new ShelfNotMountedError("About shelf has not mounted");
  const { world, projection } = restCamera
    ? {
        world: restCamera.matrixWorld.clone(),
        projection: restCamera.projectionMatrix.clone(),
      }
    : aboutIllustrationProjection(box, viewport);
  const drawingCamera = restCamera
    ? {
        eye: restCamera.position.toArray() as [number, number, number],
        aim: restCamera
          .getWorldDirection(new Vector3())
          .add(restCamera.position)
          .toArray() as [number, number, number],
        unitYaw: unit.rotation.y,
      }
    : undefined;
  const cache = new Map<Object3D, Matrix4>();
  const meshes = new Map<Mesh, Matrix4>();
  structure.parent.traverse((node) => {
    if (
      node instanceof Mesh &&
      node.name !== "room-boot:contact-pool" &&
      !node.name.startsWith("interaction-hit:")
    )
      meshes.set(node as Mesh, restWorldMatrix(node, cache).clone());
  });
  const planks = structure.children.filter(
    (node): node is Mesh =>
      node instanceof Mesh &&
      (node as Mesh).geometry.type === "ExtrudeGeometry",
  );
  const residuals: RegisteredShelf["residuals"] = [];
  for (const [index, plank] of SHELF_PLANKS.entries()) {
    const mesh = planks[index];
    if (!mesh)
      throw new ShelfNotMountedError(`About ${plank.id} plank has not mounted`);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox!;
    for (const [corner, [x, z]] of [
      [bounds.min.x, bounds.min.z],
      [bounds.max.x, bounds.min.z],
      [bounds.min.x, bounds.max.z],
      [bounds.max.x, bounds.max.z],
    ].entries()) {
      const local = new Vector3(x, bounds.max.y, z);
      const authored = [
        ((corner % 2 === 0 ? -1 : 1) * plank.width) / 2,
        plank.thickness / 2 + plank.centerY,
        ((corner < 2 ? -1 : 1) * plank.depth) / 2 + plank.centerZ,
      ] as const;
      const projected = projectAboutBootPoint(authored, drawingCamera);
      const expected = artworkPoint(
        [projected.x * 100, -projected.y * 100],
        [-150, -108, 300, 230],
        box,
      );
      const actual = cssPoint(
        local.applyMatrix4(meshes.get(mesh)!),
        world,
        projection,
        viewport,
      );
      residuals.push({
        id: `${plank.id}:${corner}`,
        px: Math.hypot(expected[0]! - actual[0]!, expected[1]! - actual[1]!),
      });
    }
  }
  for (const id of ["globe", "cactus", "desk-lamp", "vision-pro"] as const) {
    const root = unit.getObjectByName(aboutLandmarkNodeName(id));
    let physicalMesh = false;
    root?.traverse((node) => {
      if (node instanceof Mesh && meshes.has(node as Mesh)) physicalMesh = true;
    });
    if (!root || !physicalMesh)
      throw new ShelfNotMountedError(`About ${id} has not mounted`);
    const landmark = ABOUT_BOOT_LANDMARKS[id];
    const projected = projectAboutBootPoint(
      [landmark.x, SHELF_SURFACE[landmark.shelf], landmark.z],
      drawingCamera,
    );
    const expected = artworkPoint(
      [projected.x * 100, -projected.y * 100],
      [-150, -108, 300, 230],
      box,
    );
    const actual = cssPoint(
      new Vector3().applyMatrix4(restWorldMatrix(root, cache)),
      world,
      projection,
      viewport,
    );
    residuals.push({
      id,
      px: Math.hypot(expected[0]! - actual[0]!, expected[1]! - actual[1]!),
    });
  }
  requireMatch(residuals);
  return { world, projection, meshes, residuals };
}
