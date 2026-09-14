import * as THREE from "three";

import { meshBoxInLocal } from "./interaction";

/** Mount on a sibling of the hover animation, inside the movable carrier.
 * Entry uses the resting footprint. While hovered, a padded volume joins
 * the resting and raised photo, and never shrinks until hover ends.
 * A group with a custom raycast needs no draw call or collision geometry. */
export function createRestingHoverRaycast(
  getVisual: () => THREE.Object3D | null,
  enabled: () => boolean,
  hovered: () => boolean = () => false,
): THREE.Object3D["raycast"] {
  let bounds: THREE.Box3 | null = null;
  const retentionBounds = new THREE.Box3();
  const posedBounds = new THREE.Box3();
  const inverse = new THREE.Matrix4();
  const ray = new THREE.Ray();
  const point = new THREE.Vector3();

  return function (this: THREE.Object3D, raycaster, intersections) {
    if (!enabled() || !this.visible) {
      retentionBounds.makeEmpty();
      return;
    }
    for (let node = this.parent; node; node = node.parent) {
      if (!node.visible) {
        retentionBounds.makeEmpty();
        return;
      }
    }
    if (!bounds) {
      const visual = getVisual();
      if (!visual) return;
      // Measure in the nod's own frame so its tilt/lift never enters the box.
      // Empty async content retries on the next pointer event.
      bounds = meshBoxInLocal(visual);
      if (!bounds) return;
      bounds.expandByScalar(0.004);
    }
    let hitBounds = bounds;
    if (hovered()) {
      // About 12% of the photo's edge allows a sweep just below the print.
      // This margin cannot start hover on an unselected neighbouring photo.
      const margin =
        Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) *
        0.12;
      if (retentionBounds.isEmpty())
        retentionBounds.copy(bounds).expandByScalar(margin);
      const visual = getVisual();
      if (visual) {
        visual.updateMatrix();
        posedBounds
          .copy(bounds)
          .applyMatrix4(visual.matrix)
          .expandByScalar(margin);
        // Union fills the lift gap. Keeping the largest reached area also
        // prevents spring settling from pulling the exit boundary inward.
        retentionBounds.union(posedBounds);
      }
      hitBounds = retentionBounds;
    } else {
      retentionBounds.makeEmpty();
    }
    inverse.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverse);
    if (!ray.intersectBox(hitBounds, point)) return;
    point.applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersections.push({ distance, point: point.clone(), object: this });
  };
}
