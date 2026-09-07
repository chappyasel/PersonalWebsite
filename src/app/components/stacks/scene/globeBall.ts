// The About globe's ball as a real map.
//
// ModelProp's `spinPart` pulls the CreativeTrio globe's ball out of its stand
// and ring as eight octant meshes, each a slice of the faceted ball baked into
// a frame whose +Y is the axle. This module swaps those slices for the same
// eight octants of a UV sphere carrying an equirectangular map, and stands
// small marks on the surface at given latitudes and longitudes. The stand and
// ring stay exactly as shipped, so the boot silhouette, the perch tests and
// the collision hull all keep their numbers.
//
// Eight meshes rather than one for the same reason the split made eight: the
// live collision index takes one bounding box per mesh, and eight octant boxes
// hug a sphere where one box would sweep through the stationary ring.
import * as THREE from "three";

import {
  type Island,
  extractTriangles,
  findIslands,
  findSphereIsland,
  findSpinAxis,
  partitionTrianglesByOctant,
} from "./islands";

export type GlobeMarker = Readonly<{ lat: number; lon: number }>;

export type GlobeMarkerLayer = Readonly<{
  name: string;
  markers: readonly GlobeMarker[];
  color: string;
  /** Multiplier on the standard dot radius. */
  radiusScale?: number;
  /** Ball-radius multiplier for the dot centres. */
  lift?: number;
  /** Emissive intensity used only in the dark theme. */
  nightEmissive?: number;
}>;

export type SpinPartMap = Readonly<{
  /** Equirectangular textures, one per theme, left edge at 180° W. */
  light: string;
  dark: string;
  markerLayers?: readonly GlobeMarkerLayer[];
}>;

export type GlobeMarkerCluster = Readonly<{
  lat: number;
  lon: number;
  count: number;
  /** Indices into the input, in input order. */
  members: readonly number[];
}>;

/** Name of the InstancedMesh carrying the marks, for whoever raycasts it. */
export const GLOBE_MARKS_NAME = "globe-marks";
/** Visited-country pins sit between chapters and lived places. */
export const GLOBE_VISITED_MARKS_NAME = "globe-visited-marks";
/** The lived-place layer stays separate so hover can tell red personal pins
 * from orange chapter pins, including where both occupy the same city. */
export const GLOBE_LIVED_MARKS_NAME = "globe-lived-marks";

/** Marks closer than this, in degrees of arc, merge into one. About 55 km:
 * the Bay Area's dozen chapters become a single heavier mark instead of a
 * blob of overlapping dots. */
export const GLOBE_MARKER_MERGE_DEGREES = 0.5;
/** Mark radius as a fraction of the ball's radius. At the docked camera the
 * ball is about 140 CSS px tall, so 0.03 is a 4 px dot; the first cut at
 * 0.018 was 2.5 px and vanished into the coastlines. */
export const GLOBE_MARKER_RADIUS = 0.03;
/** A merged mark grows by the cube root of its count, up to this. */
export const GLOBE_MARKER_MAX_GROWTH = 1.7;
/** Marks sit this far proud of the surface so they read as dots on the map
 * rather than beads buried in it. */
export const GLOBE_MARKER_LIFT = 1.01;
/** At night the shelf is lit by the lamp alone and an unlit dot on the far
 * side of the ball goes black; a little emissive keeps them readable without
 * asking the bloom to smear them. */
export const GLOBE_MARKER_NIGHT_EMISSIVE = 0.1;
/** Widths/heights of the UV sphere. Deliberately coarse: 12 around and 8
 * tall, 168 triangles, about what the CreativeTrio ball this replaces had
 * (224). With flat shading each facet catches the light on its own. The map
 * itself stays exact; only the surface it sits on is chunky. A 96x64 first
 * cut was a perfect sphere and looked like it came from a different game;
 * 24x16 was closer and he asked for facets twice the size. */
export const GLOBE_SPHERE_SEGMENTS = [12, 8] as const;

const DEG = Math.PI / 180;
const ORIGIN = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();

/**
 * A latitude/longitude on a three.js SphereGeometry of the given radius.
 *
 * SphereGeometry puts u = 0 at −X and walks through +Z to +X at u = 0.5, with
 * +Y at the north pole. With a standard equirectangular image (180° W at the
 * left edge, north at the top; drei's loader keeps flipY on) that means
 * Greenwich faces +X and east runs toward −Z, which is the viewer's right when
 * they face Greenwich with north up. The same formula therefore places both
 * the texture and anything standing on it.
 */
export function globeSurfacePoint(
  lat: number,
  lon: number,
  radius: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  const sinTheta = Math.sin(theta);
  return out.set(
    -radius * Math.cos(phi) * sinTheta,
    radius * Math.cos(theta),
    radius * Math.sin(phi) * sinTheta,
  );
}

function toLatLon(direction: THREE.Vector3): { lat: number; lon: number } {
  const lat = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) / DEG;
  // Inverse of globeSurfacePoint's phi: atan2(z, -x) is phi, and lon = phi − 180.
  let lon = Math.atan2(direction.z, -direction.x) / DEG - 180;
  if (lon <= -180) lon += 360;
  return { lat, lon };
}

/**
 * Greedily merge marks closer than `thresholdDegrees` of arc. Deterministic
 * in input order: each mark joins the first cluster within reach of its
 * running centroid, or starts one. Distances are angular, so two chapters a
 * kilometre apart in Toronto merge just as two in Nairobi do.
 */
export function mergeGlobeMarkers(
  markers: readonly GlobeMarker[],
  thresholdDegrees = GLOBE_MARKER_MERGE_DEGREES,
): GlobeMarkerCluster[] {
  const cosThreshold = Math.cos(thresholdDegrees * DEG);
  const clusters: Array<{
    sum: THREE.Vector3;
    direction: THREE.Vector3;
    count: number;
    members: number[];
  }> = [];
  const direction = new THREE.Vector3();
  markers.forEach((marker, index) => {
    if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lon)) return;
    globeSurfacePoint(marker.lat, marker.lon, 1, direction);
    const home = clusters.find(
      (cluster) => cluster.direction.dot(direction) >= cosThreshold,
    );
    if (home) {
      home.sum.add(direction);
      home.direction.copy(home.sum).normalize();
      home.count += 1;
      home.members.push(index);
    } else {
      clusters.push({
        sum: direction.clone(),
        direction: direction.clone(),
        count: 1,
        members: [index],
      });
    }
  });
  return clusters.map((cluster) => ({
    ...toLatLon(cluster.direction),
    count: cluster.count,
    members: cluster.members,
  }));
}

/** Radius of the ball in the spin frame, from the isolated slices: the
 * faceted ball's vertices all sit on this sphere. */
export function globeBallRadius(spin: THREE.Object3D): number {
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  for (const child of spin.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const geometry = child.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(meshBox.copy(geometry.boundingBox));
  }
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z) / 2;
}

export type GlobeSplit = Readonly<{
  /** The node an animator turns; +Y is the axle. */
  spin: THREE.Group;
  /** The ball's mount under the stand mesh: at the ball's centre, aligned. */
  mount: THREE.Group;
  /** The single mesh the prop arrived as, now holding everything but the ball. */
  stand: THREE.Mesh;
  ballTriangles: number;
  totalTriangles: number;
  sphericity: number;
  tiltDegrees: number;
  /** False when no axle pins were found and the ball turns about vertical. */
  derived: boolean;
}>;

/**
 * Pull the ball out of a single-mesh globe so it can turn inside its own ring.
 *
 * The prop arrives as ONE mesh (base, stem, two axle pins, meridian ring and
 * ball, 478 triangles, one material), so the parts have to be recovered from
 * connectivity (see ./islands). The ball is identified by SHAPE, never by
 * index: it is the island whose bounding box is cubic (1.000 against 0.394 for
 * the next nearest), because traversal order is an exporter artifact and the
 * next re-export through scripts/stacks-models.mjs could reorder it silently.
 *
 * Layout produced:
 *   root
 *     ├ mesh            everything except the ball, untouched
 *     └ mount           at the ball's centre, tilted so +Y is the axle
 *         └ spin        an animator writes rotation.y here (`spinNodeName`)
 *             └ meshes  the ball, baked into that frame, in eight octants
 *
 * Eight octants rather than one mesh so the live collision index sees eight
 * tight curved-surface bounds instead of one rotating cube that sweeps
 * through the stationary ring. The ball never collides with the ring it turns
 * inside, at any angle: it is a sphere rotating about an axis through its own
 * centre, so it maps onto itself. The axle tilt is therefore about how it
 * READS (a globe spinning bolt upright looks like a ball on a spike) rather
 * than about clearance. The pivot is the BALL's centre with the pins'
 * DIRECTION: the pin midpoint sits ~0.001 off the ball centre, which would
 * otherwise wobble.
 *
 * ModelProp calls this at load and dresses the result; the boot silhouette
 * generator calls it offline so the outline it traces is the prop the room
 * draws. Returns a string naming the failure when the parts cannot be told
 * apart, leaving the prop whole.
 */
export function splitGlobeBall(
  root: THREE.Object3D,
  spinNodeName: string,
): GlobeSplit | string {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object as THREE.Mesh);
  });
  const mesh = meshes[0];
  if (meshes.length !== 1 || !mesh)
    return `expected one mesh, found ${meshes.length}`;

  const geometry = mesh.geometry;
  const islands = findIslands(geometry);
  const total = islands.reduce((n, island) => n + island.triangles.length, 0);
  const ball = findSphereIsland(islands, total);
  if (!ball)
    return (
      `no spherical island among ${islands.length} (best sphericity ` +
      `${Math.max(...islands.map((island) => island.sphericity)).toFixed(2)})`
    );

  const { axis, tiltDegrees, derived } = findSpinAxis(islands, ball);
  const rest = islands
    .filter((island) => island !== ball)
    .flatMap((island) => island.triangles)
    .sort((a, b) => a - b);
  // +Y of the spin frame onto the axle; the inverse bakes the ball into it.
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis,
  );
  const inverseAlign = align.clone().invert();
  const ballGeometries = partitionTrianglesByOctant(
    geometry,
    ball.triangles,
    ball.center,
    inverseAlign,
  ).map((triangles) =>
    extractTriangles(geometry, triangles, ball.center, inverseAlign),
  );
  const restGeometry = extractTriangles(geometry, rest);

  const spin = new THREE.Group();
  spin.name = spinNodeName;
  for (const ballGeometry of ballGeometries) {
    const ballMesh = new THREE.Mesh(ballGeometry, mesh.material);
    ballMesh.castShadow = mesh.castShadow;
    ballMesh.receiveShadow = mesh.receiveShadow;
    spin.add(ballMesh);
  }

  const mount = new THREE.Group();
  mount.position.copy(ball.center);
  mount.quaternion.copy(align);
  mount.add(spin);

  mesh.geometry = restGeometry;
  mesh.add(mount);
  // Keep the mount in the mesh's own frame: it is a child of the mesh, and
  // the mesh may carry a transform from the GLB's node graph.
  mount.updateMatrixWorld(true);

  return {
    spin,
    mount,
    stand: mesh,
    ballTriangles: ball.triangles.length,
    totalTriangles: total,
    sphericity: ball.sphericity,
    tiltDegrees,
    derived,
  };
}

/** How much of the base's footprint and height survive `slimGlobeStand`.
 * Measured off the GLB: the base is a 0.94 x 0.94 block, 0.205 tall in model
 * units, centred under a stem whose foot is 0.137 wide, so 0.6 of the
 * footprint still leaves the stem well inside it. */
export const GLOBE_STAND_FOOTPRINT = 0.6;
export const GLOBE_STAND_HEIGHT = 0.6;

/**
 * Shrink the stand's base block in place and lower everything that stood on
 * it by the height it lost, the ball included, so the stem still meets the
 * base and the base still meets the shelf.
 *
 * `stand` is the mesh the split left holding everything but the ball, with
 * its own owned geometry; `mount` is the ball's mount under it. The base is
 * the lowest island. Returns the drop in model units, 0 when nothing was
 * found to shrink.
 */
export function slimGlobeStand(
  stand: THREE.Mesh,
  mount: THREE.Object3D,
  footprint = GLOBE_STAND_FOOTPRINT,
  height = GLOBE_STAND_HEIGHT,
): number {
  const geometry = stand.geometry;
  const islands = findIslands(geometry);
  if (islands.length < 2) return 0;
  const base = islands.reduce((lowest, island) =>
    island.min.y < lowest.min.y ? island : lowest,
  );
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const baseVertices = new Set<number>();
  for (const triangle of base.triangles)
    for (let corner = 0; corner < 3; corner++)
      baseVertices.add(
        index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner,
      );
  const bottom = base.min.y;
  const drop = (base.max.y - bottom) * (1 - height);
  const centreX = base.center.x;
  const centreZ = base.center.z;
  for (let i = 0; i < position.count; i++) {
    if (baseVertices.has(i)) {
      position.setXYZ(
        i,
        centreX + (position.getX(i) - centreX) * footprint,
        bottom + (position.getY(i) - bottom) * height,
        centreZ + (position.getZ(i) - centreZ) * footprint,
      );
    } else {
      position.setY(i, position.getY(i) - drop);
    }
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mount.position.y -= drop;
  mount.updateMatrixWorld(true);
  closeGlobeBase(stand);
  return drop;
}

/**
 * Give the base a bottom.
 *
 * The CC0 stand is modelled sitting on a surface and has no face under its
 * base, which never showed until the close-up's tilt turned the underside
 * toward the camera and the block read as a bowl. When the lowest island has
 * no downward-facing triangle at its floor, its floor ring is closed with a
 * fan from its centre. Every attribute the geometry carries is filled in:
 * normals straight down, everything else copied from a base vertex so the
 * atlas colours the new face as the base. Returns false when there was
 * already a floor, or no ring to close.
 */
export function closeGlobeBase(stand: THREE.Mesh): boolean {
  const geometry = stand.geometry;
  const islands = findIslands(geometry);
  if (islands.length === 0) return false;
  const base = islands.reduce((lowest, island) =>
    island.min.y < lowest.min.y ? island : lowest,
  );
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertexIndex = (triangle: number, corner: number) =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
  const floor = base.min.y;
  const epsilon = Math.max(1e-4, (base.max.y - floor) * 0.02);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const ring: THREE.Vector3[] = [];
  const seen = new Set<string>();
  let template = -1;
  for (const triangle of base.triangles) {
    a.fromBufferAttribute(position, vertexIndex(triangle, 0));
    b.fromBufferAttribute(position, vertexIndex(triangle, 1));
    c.fromBufferAttribute(position, vertexIndex(triangle, 2));
    if (
      Math.abs(a.y - floor) < epsilon &&
      Math.abs(b.y - floor) < epsilon &&
      Math.abs(c.y - floor) < epsilon
    ) {
      normal.copy(b).sub(a).cross(edge.copy(c).sub(a));
      // A floor facing down already: nothing to close.
      if (normal.y < 0) return false;
    }
    for (let corner = 0; corner < 3; corner++) {
      const i = vertexIndex(triangle, corner);
      if (Math.abs(position.getY(i) - floor) >= epsilon) continue;
      // Rounded through Math.round so a seam's −0 and 0 meet as one point.
      const key = `${Math.round(position.getX(i) * 1e5) / 1e5},${Math.round(position.getZ(i) * 1e5) / 1e5}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ring.push(new THREE.Vector3(position.getX(i), floor, position.getZ(i)));
      if (template < 0) template = i;
    }
  }
  if (ring.length < 3 || template < 0) return false;
  const centre = ring
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / ring.length);
  ring.sort(
    (p, q) =>
      Math.atan2(p.z - centre.z, p.x - centre.x) -
      Math.atan2(q.z - centre.z, q.x - centre.x),
  );
  // A fan from the centre, each triangle wound so its face points down.
  const fan: THREE.Vector3[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    normal.copy(p).sub(centre).cross(edge.copy(q).sub(centre));
    if (normal.y < 0) fan.push(centre, p, q);
    else fan.push(centre, q, p);
  }
  const rebuilt = new THREE.BufferGeometry();
  const added = fan.length;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const source = attribute as THREE.BufferAttribute;
    const itemSize = source.itemSize;
    const array = new Float32Array((source.count + added) * itemSize);
    for (let i = 0; i < source.count; i++)
      for (let k = 0; k < itemSize; k++)
        array[i * itemSize + k] = source.getComponent(i, k);
    for (let j = 0; j < added; j++) {
      const w = (source.count + j) * itemSize;
      if (name === "position") {
        const vertex = fan[j]!;
        array[w] = vertex.x;
        array[w + 1] = vertex.y;
        array[w + 2] = vertex.z;
      } else if (name === "normal") {
        array[w] = 0;
        array[w + 1] = -1;
        array[w + 2] = 0;
      } else {
        for (let k = 0; k < itemSize; k++)
          array[w + k] = source.getComponent(template, k);
      }
    }
    rebuilt.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  if (index) {
    const indices = new Uint32Array(index.count + added);
    for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);
    for (let j = 0; j < added; j++)
      indices[index.count + j] = position.count + j;
    rebuilt.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  rebuilt.userData = { ...geometry.userData, owned: true };
  rebuilt.computeBoundingBox();
  rebuilt.computeBoundingSphere();
  stand.geometry = rebuilt;
  if ((geometry.userData as { owned?: boolean }).owned === true)
    geometry.dispose();
  return true;
}

/** How much of each axle pin's reach past the meridian ring survives
 * `trimGlobeAxlePins`. The CC0 pins run a full third of a ball radius past
 * the ring; he asked for a third of that. */
export const GLOBE_PIN_REACH = 1 / 3;

/**
 * Shorten the two axle pins where they stick out past the meridian ring.
 *
 * The pins are the matched pair of islands on the axle (the same pair
 * `findSpinAxis` used to derive it); the ring is the largest island that is
 * not one of them. Only the part of each pin beyond the ring's end on its
 * side moves, so the ring still meets the pin and the ball still turns on
 * it. Returns false, changing nothing, when the parts cannot be told apart.
 */
export function trimGlobeAxlePins(
  stand: THREE.Mesh,
  mount: THREE.Object3D,
  keep = GLOBE_PIN_REACH,
): boolean {
  const geometry = stand.geometry;
  const islands = findIslands(geometry);
  if (islands.length < 3) return false;
  const centre = mount.position;
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(mount.quaternion);
  const offset = new THREE.Vector3();
  const along = (point: THREE.Vector3) =>
    offset.copy(point).sub(centre).dot(axis);
  // Candidates sit on the axle; the pair is matched hardware on opposite
  // sides, the same rule findSpinAxis used, so the base block under the
  // bottom pin and the stem beside it never qualify.
  const candidates = islands.filter((island) => {
    offset.copy(island.center).sub(centre);
    const axial = offset.dot(axis);
    const perpendicular = Math.sqrt(
      Math.max(0, offset.lengthSq() - axial * axial),
    );
    return Math.abs(axial) > 0.3 && perpendicular < Math.abs(axial) * 0.25;
  });
  let pins: [Island, Island] | null = null;
  let bestBalance = Infinity;
  for (const top of candidates) {
    const topAlong = along(top.center);
    if (topAlong <= 0) continue;
    for (const bottom of candidates) {
      const bottomAlong = along(bottom.center);
      if (bottomAlong >= 0) continue;
      if (top.triangles.length !== bottom.triangles.length) continue;
      const spread = Math.max(top.extent.length(), bottom.extent.length()) || 1;
      if (top.extent.distanceTo(bottom.extent) > spread * 0.1) continue;
      const balance = Math.abs(topAlong + bottomAlong);
      if (balance < bestBalance) {
        bestBalance = balance;
        pins = [top, bottom];
      }
    }
  }
  if (!pins) return false;
  const ring = islands
    .filter((island) => !pins.includes(island))
    .reduce((largest, island) =>
      island.triangles.length > largest.triangles.length ? island : largest,
    );
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertexIndex = (triangle: number, corner: number) =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
  const vertex = new THREE.Vector3();
  for (const pin of pins) {
    const side = Math.sign(along(pin.center)) || 1;
    // Where the ring ends on this pin's side, measured along the axle.
    let attach = -Infinity;
    for (const triangle of ring.triangles)
      for (let corner = 0; corner < 3; corner++) {
        vertex.fromBufferAttribute(position, vertexIndex(triangle, corner));
        attach = Math.max(attach, side * along(vertex));
      }
    const seen = new Set<number>();
    for (const triangle of pin.triangles)
      for (let corner = 0; corner < 3; corner++) {
        const i = vertexIndex(triangle, corner);
        if (seen.has(i)) continue;
        seen.add(i);
        vertex.fromBufferAttribute(position, i);
        const reach = side * along(vertex);
        if (reach <= attach) continue;
        const trimmed = attach + (reach - attach) * keep;
        vertex.addScaledVector(axis, side * (trimmed - reach));
        position.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}

export type GlobeBallDressing = Readonly<{
  map: THREE.Texture;
  markerLayers?: readonly GlobeMarkerLayer[];
  /** Night theme: layers carry their configured emissive contribution. */
  dark?: boolean;
}>;

/**
 * Replace the ball slices under `spin` with a mapped UV sphere and stand the
 * marks on it. Everything created here is tagged for ModelProp's disposal:
 * geometries `owned`, materials private. The map texture is drei's and is
 * never disposed here.
 *
 * Returns false, leaving the ball as it was, when `spin` holds no slices.
 */
export function dressGlobeBall(
  spin: THREE.Group,
  { map, markerLayers, dark = false }: GlobeBallDressing,
): boolean {
  const slices = spin.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh,
  );
  const template = slices[0];
  if (!template) return false;
  const radius = globeBallRadius(spin);
  if (!(radius > 0)) return false;

  // The split aims +Y of this frame along the axle, but the axle's sense
  // comes from whichever pin the connectivity walk met first. If it points
  // down in the model, north would sit at the bottom; turn the map and the
  // marks together so north is up whatever the pins said.
  const parent = spin.parent;
  const axleUp = parent
    ? new THREE.Vector3(0, 1, 0).applyQuaternion(parent.quaternion).y >= 0
    : true;
  const frame = axleUp
    ? IDENTITY
    : new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI,
      );

  const sphere = new THREE.SphereGeometry(
    radius,
    GLOBE_SPHERE_SEGMENTS[0],
    GLOBE_SPHERE_SEGMENTS[1],
  );
  sphere.applyQuaternion(frame);
  const triangleCount = (sphere.index?.count ?? 0) / 3;
  const all = Array.from({ length: triangleCount }, (_, index) => index);
  const octants = partitionTrianglesByOctant(sphere, all, ORIGIN, IDENTITY).map(
    (triangles) => extractTriangles(sphere, triangles),
  );
  sphere.dispose();

  // Flat shading reads the facet normals off screen-space derivatives, so
  // the smooth normals the sphere carries are ignored and every facet is one
  // plane of light, the way the atlas props are lit.
  const material = new THREE.MeshStandardMaterial({
    map,
    metalness: 0,
    roughness: 0.8,
    flatShading: true,
  });
  for (const slice of slices) {
    spin.remove(slice);
    if ((slice.geometry.userData as { owned?: boolean }).owned === true)
      slice.geometry.dispose();
  }
  for (const geometry of octants) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = template.castShadow;
    mesh.receiveShadow = template.receiveShadow;
    spin.add(mesh);
  }

  for (const layer of markerLayers ?? []) {
    if (layer.markers.length === 0) continue;
    const clusters = mergeGlobeMarkers(layer.markers);
    const dot = new THREE.SphereGeometry(
      radius * GLOBE_MARKER_RADIUS * (layer.radiusScale ?? 1),
      8,
      6,
    );
    dot.userData.owned = true;
    const dotMaterial = new THREE.MeshStandardMaterial({
      color: layer.color,
      metalness: 0,
      roughness: 0.5,
      emissive: layer.color,
      emissiveIntensity: dark
        ? (layer.nightEmissive ?? GLOBE_MARKER_NIGHT_EMISSIVE)
        : 0,
    });
    const marks = new THREE.InstancedMesh(dot, dotMaterial, clusters.length);
    marks.name = layer.name;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    clusters.forEach((cluster, index) => {
      globeSurfacePoint(
        cluster.lat,
        cluster.lon,
        radius * (layer.lift ?? GLOBE_MARKER_LIFT),
        position,
      ).applyQuaternion(frame);
      scale.setScalar(
        Math.min(GLOBE_MARKER_MAX_GROWTH, Math.cbrt(cluster.count)),
      );
      matrix.compose(position, IDENTITY, scale);
      marks.setMatrixAt(index, matrix);
    });
    marks.instanceMatrix.needsUpdate = true;
    // The ball is the hull; dots must not add bodies of their own.
    marks.userData.physicsIgnore = true;
    marks.castShadow = template.castShadow;
    marks.receiveShadow = false;
    // An InstancedMesh culls by its geometry's bounds unless told otherwise,
    // and the dot geometry is a few millimetres at the origin.
    marks.computeBoundingSphere();
    spin.add(marks);
  }
  return true;
}
