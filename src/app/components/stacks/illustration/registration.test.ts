import { createHash } from "node:crypto";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SphereGeometry,
} from "three";
import { describe, expect, it } from "vitest";

import type { RoomArtworkRegistration } from "./artwork";
import { ShelfNotMountedError, registerCapturedShelf } from "./registration";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function fixture() {
  const unit = new Group();
  unit.position.set(22.4, 0.15, -0.2);
  unit.rotation.y = 0.42;
  const mesh: Mesh = new Mesh(
    new BoxGeometry(2.64, 0.07, 0.85),
    new MeshBasicMaterial(),
  );
  mesh.name = "retained-plank";
  mesh.position.set(-0.13, -0.87, 0.04);
  unit.add(mesh);
  const floor = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  unit.add(floor);
  unit.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(35, 4 / 3, 0.1, 100);
  camera.position.set(23, 0.4, 5.8);
  camera.lookAt(22.7, -0.1, 0);
  camera.updateMatrixWorld(true);
  const localMatrix = mesh.matrix.toArray();
  const source = {
    version: 1,
    unit: "projects",
    index: 4,
    case: "light-desktop",
    viewBox: [30, 20, 680, 420],
    raster: [800, 600],
    camera: {
      world: camera.matrixWorld.toArray(),
      projection: camera.projectionMatrix.toArray(),
    },
    unitWorld: unit.matrixWorld.toArray(),
    registrationAvailable: true,
    registrationUnavailableReason: null,
    requiresDataIdentity: false,
    capturedDataSha256: null,
    liveRotations: [],
    owners: [
      {
        id: "shelf",
        meshCount: 1,
        paths: [mesh.name],
        poseSha256: digest([
          localMatrix.map((value) => Number(value.toFixed(6))),
        ]),
        geometryIdentitySha256: digest([
          { path: mesh.name, node: mesh.name, type: mesh.geometry.type },
        ]),
      },
    ],
    probes: Array.from({ length: 8 }, (_, i) => ({
      id: `corner:${i}`,
      path: mesh.name,
      owner: "shelf",
      geometryType: mesh.geometry.type,
      localMatrix,
      capturedCoordinates: [
        (i & 1 ? 1 : -1) * 1.32,
        ((i >> 1) & 1 ? 1 : -1) * 0.035,
        ((i >> 2) & 1 ? 1 : -1) * 0.425,
      ],
      sample: {
        kind: "bounds",
        coordinates: [i & 1, (i >> 1) & 1, (i >> 2) & 1],
      },
    })),
  } as unknown as RoomArtworkRegistration;
  const box = { x: 17, y: 120, width: 356, height: 220 };
  const viewport = { x: 0, y: 0, width: 390, height: 844 };
  return { unit, mesh, floor, source, box, viewport };
}

describe("mounted shelf registration", () => {
  it("distinguishes a missing saved mesh from a mismatch and accepts it once mounted", async () => {
    const f = fixture();
    f.unit.remove(f.mesh);
    await expect(
      registerCapturedShelf(f.unit, f.source, f.box, f.viewport),
    ).rejects.toBeInstanceOf(ShelfNotMountedError);
    f.unit.add(f.mesh);
    f.unit.updateMatrixWorld(true);
    const registered = await registerCapturedShelf(
      f.unit,
      f.source,
      f.box,
      f.viewport,
    );
    expect(registered.meshes.has(f.mesh)).toBe(true);
    expect(Math.max(...registered.residuals.map(({ px }) => px))).toBeLessThan(
      0.00001,
    );
  });

  it.each(["pose", "geometry", "projection"] as const)(
    "does not classify a mounted %s mismatch as an unfinished mount",
    async (mismatch) => {
      const f = fixture();
      if (mismatch === "pose") f.mesh.position.x += 0.1;
      else if (mismatch === "geometry") f.mesh.geometry = new SphereGeometry();
      else f.unit.position.x += 4.4;
      f.unit.updateMatrixWorld(true);
      const outcome: unknown = await registerCapturedShelf(
        f.unit,
        f.source,
        f.box,
        f.viewport,
      ).catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(Error);
      expect(outcome).not.toBeInstanceOf(ShelfNotMountedError);
    },
  );

  it("uses the full saved unit transform and retains only captured meshes", async () => {
    const f = fixture();
    const result = await registerCapturedShelf(
      f.unit,
      f.source,
      f.box,
      f.viewport,
    );
    expect(result.residuals).toHaveLength(8);
    expect(Math.max(...result.residuals.map(({ px }) => px))).toBeLessThan(
      0.00001,
    );
    expect(result.meshes.has(f.mesh)).toBe(true);
    expect(result.meshes.has(f.floor)).toBe(false);
  });

  it("rejects a same-type plank resize against the saved capture coordinates", async () => {
    const f = fixture();
    f.mesh.geometry = new BoxGeometry(3.2, 0.07, 0.85);
    await expect(
      registerCapturedShelf(f.unit, f.source, f.box, f.viewport),
    ).rejects.toThrow("exceeds 3px");
  });

  it("rejects changed authored poses before showing WebGL", async () => {
    const f = fixture();
    f.mesh.position.x += 0.02;
    f.unit.updateMatrixWorld(true);
    await expect(
      registerCapturedShelf(f.unit, f.source, f.box, f.viewport),
    ).rejects.toThrow("Saved mesh identity changed");
  });

  it("rejects changed geometry identities even when the pose is unchanged", async () => {
    const f = fixture();
    f.mesh.geometry = new SphereGeometry();
    await expect(
      registerCapturedShelf(f.unit, f.source, f.box, f.viewport),
    ).rejects.toThrow("Saved mesh identity changed");
  });

  it("rejects a capture from another physical unit even when its local poses match", async () => {
    const f = fixture();
    f.unit.position.x += 4.4;
    f.unit.updateMatrixWorld(true);
    await expect(
      registerCapturedShelf(f.unit, f.source, f.box, f.viewport),
    ).rejects.toThrow("exceeds 3px");
  });

  it("keeps a changed Books selection illustrated", async () => {
    const f = fixture();
    const source = {
      ...f.source,
      requiresDataIdentity: true,
      capturedDataSha256: "approved-books",
    } as unknown as RoomArtworkRegistration;
    await expect(
      registerCapturedShelf(
        f.unit,
        source,
        f.box,
        f.viewport,
        "different-books",
      ),
    ).rejects.toThrow("current book selection");
  });
});
