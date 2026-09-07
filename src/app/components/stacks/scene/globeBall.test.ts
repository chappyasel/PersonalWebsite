import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  GLOBE_MARKER_MAX_GROWTH,
  GLOBE_MARKER_NIGHT_EMISSIVE,
  GLOBE_MARKS_NAME,
  closeGlobeBase,
  dressGlobeBall,
  globeBallRadius,
  globeSurfacePoint,
  mergeGlobeMarkers,
  slimGlobeStand,
  trimGlobeAxlePins,
} from "./globeBall";

const RADIUS = 0.7;

function close(v: THREE.Vector3, x: number, y: number, z: number) {
  expect(v.x).toBeCloseTo(x, 6);
  expect(v.y).toBeCloseTo(y, 6);
  expect(v.z).toBeCloseTo(z, 6);
}

/** A stand-in for the split's output: eight slices of a faceted ball whose
 * vertices sit on the RADIUS sphere, under a mount whose +Y is the axle. */
function fakeSplit(axleDown = false) {
  const mount = new THREE.Group();
  mount.quaternion.setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    axleDown ? Math.PI : 0,
  );
  const spin = new THREE.Group();
  mount.add(spin);
  // Poles on ±Y like the real ball, so the bounding box spans the radius.
  const ball = new THREE.SphereGeometry(RADIUS, 16, 12);
  const shared = new THREE.MeshStandardMaterial();
  shared.userData.shared = true;
  for (let octant = 0; octant < 8; octant++) {
    const slice = ball.clone();
    slice.userData = { owned: true };
    const mesh = new THREE.Mesh(slice, shared);
    mesh.castShadow = true;
    spin.add(mesh);
  }
  return { mount, spin };
}

describe("globeSurfacePoint", () => {
  it("puts Greenwich at +X, the poles on ±Y, and east toward −Z", () => {
    close(globeSurfacePoint(0, 0, RADIUS), RADIUS, 0, 0);
    close(globeSurfacePoint(90, 0, RADIUS), 0, RADIUS, 0);
    close(globeSurfacePoint(-90, 0, RADIUS), 0, -RADIUS, 0);
    close(globeSurfacePoint(0, 90, RADIUS), 0, 0, -RADIUS);
    close(globeSurfacePoint(0, -90, RADIUS), 0, 0, RADIUS);
    close(globeSurfacePoint(0, 180, RADIUS), -RADIUS, 0, 0);
  });

  it("agrees with the UV sphere it is drawn on", () => {
    // SphereGeometry's own vertex at u = 0.25, v = 0.5 (lon −90, lat 0),
    // which is the mapping the texture is authored for.
    const sphere = new THREE.SphereGeometry(RADIUS, 4, 2);
    const position = sphere.getAttribute("position");
    const uv = sphere.getAttribute("uv");
    let checked = 0;
    for (let index = 0; index < uv.count; index++) {
      const u = uv.getX(index);
      const v = uv.getY(index);
      if (v === 0 || v === 1) continue; // pole fan, u is arbitrary there
      const lon = u * 360 - 180;
      const lat = v * 180 - 90;
      const expected = globeSurfacePoint(lat, lon, RADIUS);
      expect(position.getX(index)).toBeCloseTo(expected.x, 5);
      expect(position.getY(index)).toBeCloseTo(expected.y, 5);
      expect(position.getZ(index)).toBeCloseTo(expected.z, 5);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("mergeGlobeMarkers", () => {
  it("keeps distant marks apart and merges neighbours into one heavier mark", () => {
    const clusters = mergeGlobeMarkers(
      [
        { lat: 37.77, lon: -122.42 }, // San Francisco
        { lat: 37.8, lon: -122.27 }, // Oakland
        { lat: 37.39, lon: -122.06 }, // Silicon Valley, via Oakland's centroid
        { lat: 51.51, lon: -0.13 }, // London
      ],
      0.5,
    );
    expect(clusters.map((c) => c.count)).toEqual([3, 1]);
    expect(clusters[0]!.lat).toBeCloseTo(37.65, 1);
    expect(clusters[0]!.lon).toBeCloseTo(-122.25, 1);
    expect(clusters[1]).toMatchObject({ count: 1 });
    expect(clusters[1]!.lat).toBeCloseTo(51.51, 2);
    expect(clusters[1]!.lon).toBeCloseTo(-0.13, 2);
  });

  it("measures across the antimeridian and skips marks without coordinates", () => {
    const clusters = mergeGlobeMarkers(
      [
        { lat: 0, lon: 179.9 },
        { lat: 0, lon: -179.9 },
        { lat: Number.NaN, lon: 10 },
      ],
      0.5,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(2);
    expect(Math.abs(clusters[0]!.lon)).toBeCloseTo(180, 1);
  });
});

describe("dressGlobeBall", () => {
  const map = new THREE.Texture();
  const layer = (markers: readonly { lat: number; lon: number }[]) => ({
    name: GLOBE_MARKS_NAME,
    markers,
    color: "#ff9b50",
  });

  it("reads the ball radius off the slices", () => {
    const { spin } = fakeSplit();
    expect(globeBallRadius(spin)).toBeCloseTo(RADIUS, 3);
  });

  it("replaces the slices with eight mapped octants and one instanced mark set", () => {
    const { spin } = fakeSplit();
    const markers = [
      { lat: 37.77, lon: -122.42 },
      { lat: 37.8, lon: -122.27 },
      { lat: 51.51, lon: -0.13 },
    ];
    expect(dressGlobeBall(spin, { map, markerLayers: [layer(markers)] })).toBe(
      true,
    );
    const meshes = spin.children.filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh),
    );
    const marks = spin.children.find(
      (child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh,
    );
    expect(meshes).toHaveLength(8);
    expect(marks?.count).toBe(2);
    expect(marks?.userData.physicsIgnore).toBe(true);
    // Every octant carries the map on a private material and an owned
    // geometry with UVs, and keeps the template's shadow flag.
    const materials = new Set(meshes.map((mesh) => mesh.material));
    expect(materials.size).toBe(1);
    const [material] = materials;
    expect((material as THREE.MeshStandardMaterial).map).toBe(map);
    expect((material as THREE.Material).userData.shared).not.toBe(true);
    for (const mesh of meshes) {
      expect(mesh.geometry.userData.owned).toBe(true);
      expect(mesh.geometry.getAttribute("uv")).toBeDefined();
      expect(mesh.castShadow).toBe(true);
      mesh.geometry.computeBoundingSphere();
      expect(mesh.geometry.boundingSphere!.radius).toBeLessThanOrEqual(
        RADIUS + 1e-6,
      );
    }
    // The vertices of every octant sit on the ball's sphere.
    const vertex = new THREE.Vector3();
    for (const mesh of meshes) {
      const position = mesh.geometry.getAttribute("position");
      for (let index = 0; index < position.count; index += 7) {
        vertex.fromBufferAttribute(position, index);
        expect(vertex.length()).toBeCloseTo(RADIUS, 5);
      }
    }
  });

  it("stands the marks just proud of the surface where the texture puts the city", () => {
    const { spin } = fakeSplit();
    dressGlobeBall(spin, {
      map,
      markerLayers: [layer([{ lat: 51.51, lon: -0.13 }])],
    });
    const marks = spin.children.find(
      (child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh,
    )!;
    const matrix = new THREE.Matrix4();
    marks.getMatrixAt(0, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const expected = globeSurfacePoint(51.51, -0.13, RADIUS);
    expect(position.length()).toBeGreaterThan(RADIUS);
    expect(position.length()).toBeLessThan(RADIUS * 1.03);
    expect(position.clone().normalize().dot(expected.normalize())).toBeCloseTo(
      1,
      6,
    );
  });

  it("renders independently styled marker layers at their own lift", () => {
    const { spin } = fakeSplit();
    dressGlobeBall(spin, {
      map,
      dark: true,
      markerLayers: [
        layer([{ lat: 37.77, lon: -122.42 }]),
        {
          name: "globe-lived-marks",
          markers: [{ lat: 47.61, lon: -122.33 }],
          color: "#d62828",
          radiusScale: 1.15,
          lift: 1.035,
          nightEmissive: 0.12,
        },
      ],
    });

    const chapters = spin.getObjectByName(GLOBE_MARKS_NAME) as
      | THREE.InstancedMesh
      | undefined;
    const lived = spin.getObjectByName("globe-lived-marks") as
      | THREE.InstancedMesh
      | undefined;
    expect(chapters?.count).toBe(1);
    expect(lived?.count).toBe(1);
    expect(
      (lived?.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("d62828");
    expect(
      (lived?.material as THREE.MeshStandardMaterial).emissiveIntensity,
    ).toBe(0.12);
    const matrix = new THREE.Matrix4();
    lived!.getMatrixAt(0, matrix);
    expect(
      new THREE.Vector3().setFromMatrixPosition(matrix).length(),
    ).toBeCloseTo(RADIUS * 1.035, 6);
  });

  it("keeps night marks dimmer without making day marks emissive", () => {
    const markerMaterial = (dark: boolean) => {
      const { spin } = fakeSplit();
      dressGlobeBall(spin, {
        map,
        markerLayers: [layer([{ lat: 51.51, lon: -0.13 }])],
        dark,
      });
      const marks = spin.children.find(
        (child): child is THREE.InstancedMesh =>
          child instanceof THREE.InstancedMesh,
      )!;
      return marks.material as THREE.MeshStandardMaterial;
    };

    expect(markerMaterial(false).emissiveIntensity).toBe(0);
    expect(markerMaterial(true).emissiveIntensity).toBe(
      GLOBE_MARKER_NIGHT_EMISSIVE,
    );
  });

  it("turns the map over when the split's axle points down the model", () => {
    const upright = fakeSplit(false);
    const inverted = fakeSplit(true);
    for (const { spin } of [upright, inverted])
      dressGlobeBall(spin, {
        map,
        markerLayers: [layer([{ lat: 60, lon: 0 }])],
      });
    const world = (group: THREE.Group) => {
      (group.parent ?? group).updateMatrixWorld(true);
      const marks = group.children.find(
        (child): child is THREE.InstancedMesh =>
          child instanceof THREE.InstancedMesh,
      )!;
      const matrix = new THREE.Matrix4();
      marks.getMatrixAt(0, matrix);
      return new THREE.Vector3()
        .setFromMatrixPosition(matrix)
        .applyMatrix4(marks.matrixWorld);
    };
    // A northern mark ends up high in the MODEL either way.
    expect(world(upright.spin).y).toBeGreaterThan(0);
    expect(world(inverted.spin).y).toBeGreaterThan(0);
  });

  it("caps how much a merged mark grows", () => {
    const { spin } = fakeSplit();
    dressGlobeBall(spin, {
      map,
      markerLayers: [
        layer(
          Array.from({ length: 20 }, () => ({
            lat: 37.77,
            lon: -122.42,
          })),
        ),
      ],
    });
    const marks = spin.children.find(
      (child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh,
    )!;
    const matrix = new THREE.Matrix4();
    marks.getMatrixAt(0, matrix);
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    expect(scale.x).toBeCloseTo(GLOBE_MARKER_MAX_GROWTH, 6);
  });

  it("leaves a spin node with no slices alone", () => {
    const spin = new THREE.Group();
    expect(dressGlobeBall(spin, { map })).toBe(false);
    expect(spin.children).toHaveLength(0);
  });
});

describe("trimGlobeAxlePins", () => {
  /** Ball centred at the mount with a vertical axle: a ring running from
   * y −0.8 to 0.8 off to one side, a pin through each pole reaching to ±1,
   * and a base block underneath. */
  function fakeStand() {
    const parts = [
      new THREE.BoxGeometry(0.1, 1.6, 0.1).translate(-0.75, 0, 0), // ring
      new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(0, 0.75, 0), // top pin
      new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(0, -0.75, 0), // bottom pin
      new THREE.BoxGeometry(1, 0.2, 1).translate(0, -1.3, 0), // base
    ].map((part) => part.toNonIndexed());
    const count = parts.reduce(
      (n, part) => n + part.getAttribute("position").count,
      0,
    );
    const position = new Float32Array(count * 3);
    let offset = 0;
    for (const part of parts) {
      position.set(part.getAttribute("position").array as Float32Array, offset);
      offset += part.getAttribute("position").count * 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    const stand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const mount = new THREE.Group();
    stand.add(mount);
    return { stand, mount };
  }

  it("keeps a third of each pin's reach past the ring and nothing else moves", () => {
    const { stand, mount } = fakeStand();
    expect(trimGlobeAxlePins(stand, mount, 1 / 3)).toBe(true);
    const position = stand.geometry.getAttribute("position");
    let top = -Infinity;
    let bottom = Infinity;
    let ringTop = -Infinity;
    let baseBottom = Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      // Box corners sit at ±0.05, which float32 rounds just past 0.05.
      if (Math.abs(x) <= 0.06 && y > 0.4) top = Math.max(top, y);
      if (Math.abs(x) <= 0.06 && y < -0.4 && y > -1.15)
        bottom = Math.min(bottom, y);
      if (x < -0.5) ringTop = Math.max(ringTop, y);
      if (y < -1.1) baseBottom = Math.min(baseBottom, y);
    }
    expect(top).toBeCloseTo(0.8 + 0.2 / 3, 6);
    expect(bottom).toBeCloseTo(-(0.8 + 0.2 / 3), 6);
    expect(ringTop).toBeCloseTo(0.8, 6);
    expect(baseBottom).toBeCloseTo(-1.4, 6);
  });

  it("refuses when it cannot find a matched pair of pins", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const stand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    expect(trimGlobeAxlePins(stand, new THREE.Group())).toBe(false);
  });
});

describe("slimGlobeStand", () => {
  /** A base block on the floor with a post standing on it and a mount above,
   * as one non-indexed geometry the way the split leaves the stand. */
  function fakeStand() {
    const base = new THREE.BoxGeometry(1, 0.2, 1).translate(0, -0.9, 0);
    const post = new THREE.BoxGeometry(0.1, 0.4, 0.1).translate(0, -0.6, 0);
    const parts = [base, post].map((part) => part.toNonIndexed());
    const count = parts.reduce(
      (n, part) => n + part.getAttribute("position").count,
      0,
    );
    const position = new Float32Array(count * 3);
    let offset = 0;
    for (const part of parts) {
      position.set(part.getAttribute("position").array as Float32Array, offset);
      offset += part.getAttribute("position").count * 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    const stand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const mount = new THREE.Group();
    mount.position.set(0, 0.2, 0);
    stand.add(mount);
    return { stand, mount };
  }

  it("shrinks the base about its centre and lowers the rest by the lost height", () => {
    const { stand, mount } = fakeStand();
    const drop = slimGlobeStand(stand, mount, 0.6, 0.5);
    expect(drop).toBeCloseTo(0.1, 6);
    stand.geometry.computeBoundingBox();
    const box = stand.geometry.boundingBox!;
    // Base footprint is 0.6 of a unit, bottom still at -1.
    expect(box.min.y).toBeCloseTo(-1, 6);
    expect(box.min.x).toBeCloseTo(-0.3, 6);
    expect(box.max.x).toBeCloseTo(0.3, 6);
    // The post came down with the base's top face: it used to reach -0.4.
    expect(box.max.y).toBeCloseTo(-0.4 - 0.1, 6);
    expect(mount.position.y).toBeCloseTo(0.1, 6);
  });

  it("does nothing to a stand with a single island", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const stand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const mount = new THREE.Group();
    expect(slimGlobeStand(stand, mount)).toBe(0);
    expect(mount.position.y).toBe(0);
  });
});

describe("closeGlobeBase", () => {
  /** A base and a post as one non-indexed geometry with normals and uvs. */
  function standWith(base: THREE.BufferGeometry) {
    const post = new THREE.BoxGeometry(0.1, 0.4, 0.1).translate(0, -0.6, 0);
    const parts = [base, post].map((part) => part.toNonIndexed());
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"] as const) {
      const size = name === "uv" ? 2 : 3;
      const count = parts.reduce(
        (n, part) => n + part.getAttribute(name).count,
        0,
      );
      const array = new Float32Array(count * size);
      let offset = 0;
      for (const part of parts) {
        const attribute = part.getAttribute(name);
        array.set(attribute.array as Float32Array, offset);
        offset += attribute.count * size;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    geometry.userData = { owned: true };
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  }
  /** Triangles lying in the floor plane, with their winding normals. */
  function floorFaces(stand: THREE.Mesh, floor: number) {
    const position = stand.geometry.getAttribute("position");
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const faces: number[] = [];
    for (let t = 0; t < position.count / 3; t++) {
      a.fromBufferAttribute(position, t * 3);
      b.fromBufferAttribute(position, t * 3 + 1);
      c.fromBufferAttribute(position, t * 3 + 2);
      if ([a, b, c].every((v) => Math.abs(v.y - floor) < 1e-4))
        faces.push(b.sub(a).cross(c.sub(a)).y);
    }
    return faces;
  }

  it("closes an open base with a fan that faces down and carries every attribute", () => {
    // An open-ended cylinder: the CC0 base's situation, walls and top only.
    const stand = standWith(
      new THREE.CylinderGeometry(0.5, 0.5, 0.2, 8, 1, true).translate(
        0,
        -0.9,
        0,
      ),
    );
    const before = stand.geometry.getAttribute("position").count;
    expect(closeGlobeBase(stand)).toBe(true);
    const faces = floorFaces(stand, -1);
    expect(faces).toHaveLength(8);
    for (const y of faces) expect(y).toBeLessThan(0);
    const geometry = stand.geometry;
    expect(geometry.getAttribute("position").count).toBe(before + 24);
    expect(geometry.getAttribute("normal").count).toBe(before + 24);
    expect(geometry.getAttribute("uv").count).toBe(before + 24);
    expect(geometry.getAttribute("normal").getY(before)).toBe(-1);
    expect(geometry.userData.owned).toBe(true);
  });

  it("leaves a base that already has a floor alone", () => {
    const stand = standWith(
      new THREE.BoxGeometry(1, 0.2, 1).translate(0, -0.9, 0),
    );
    const before = stand.geometry.getAttribute("position").count;
    expect(closeGlobeBase(stand)).toBe(false);
    expect(stand.geometry.getAttribute("position").count).toBe(before);
  });
});
