import * as THREE from "three";

export const GOLF_BALL_RADIUS = 0.05;

const DIMPLE_COUNT = 92;
const DIMPLE_ANGLE = 0.118;
// At the authored 18–24 px screen size a regulation-scale recess disappears
// after tone mapping. This slightly exaggerated depth preserves the familiar
// dimple read without changing the ball's outer radius or collider.
const DIMPLE_DEPTH = 0.004;

/** A tiny repeating height field preserves the dimple highlights after the
 * scene's depth-of-field pass. Geometry owns the silhouette and contact; this
 * texture only adds the sub-pixel light/shadow cue that a 20px ball needs. */
export function createGolfBallBumpTexture(): THREE.DataTexture {
  const width = 256;
  const height = 128;
  const columns = 14;
  const rows = 8;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rowPosition = ((y + 0.5) / height) * rows;
      const row = Math.floor(rowPosition);
      const columnPosition =
        ((x + 0.5) / width) * columns - (row % 2 === 0 ? 0 : 0.5);
      const dx = Math.abs(columnPosition - Math.round(columnPosition));
      const dy = Math.abs(rowPosition - (row + 0.5));
      const distance = Math.hypot(dx, dy) / 0.34;
      const t = THREE.MathUtils.clamp(1 - distance, 0, 1);
      const value = Math.round(255 - 225 * t * t * (3 - 2 * t));
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A shared, modest-poly ball whose dimples are part of the surface rather than
 * painted dots. An icosphere distributes vertices evenly, so the recesses stay
 * round at every latitude (a UV sphere starves its poles of useful topology).
 */
export function createDimpledGolfBallGeometry(): THREE.IcosahedronGeometry {
  const geometry = new THREE.IcosahedronGeometry(GOLF_BALL_RADIUS, 4);
  const positions = geometry.getAttribute("position");
  const centers = Array.from({ length: DIMPLE_COUNT }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / DIMPLE_COUNT;
    const radius = Math.sqrt(1 - y * y);
    const azimuth = index * Math.PI * (3 - Math.sqrt(5));
    return new THREE.Vector3(
      Math.cos(azimuth) * radius,
      y,
      Math.sin(azimuth) * radius,
    );
  });
  const vertex = new THREE.Vector3();

  for (let index = 0; index < positions.count; index++) {
    vertex.fromBufferAttribute(positions, index).normalize();
    let nearestDot = -1;
    for (const center of centers)
      nearestDot = Math.max(nearestDot, vertex.dot(center));
    const angle = Math.acos(THREE.MathUtils.clamp(nearestDot, -1, 1));
    const proximity = THREE.MathUtils.clamp(1 - angle / DIMPLE_ANGLE, 0, 1);
    const eased = proximity * proximity * (3 - 2 * proximity);
    vertex.multiplyScalar(GOLF_BALL_RADIUS - DIMPLE_DEPTH * eased);
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
