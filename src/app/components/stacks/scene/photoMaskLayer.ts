import type * as THREE from "three";

// Which meshes the print grade treats as photographs.
//
// The grade's chroma rebuild (Effects.tsx) exists to give the ACES-flattened
// sky and meadow their colour back. A photograph never lost that colour: it is
// display-referred content already, so the same boost overshoots it. Measured
// on the desk portrait in light mode against the file it came from: +6% HSV
// saturation with the grade on, -7% with the whole grade off. So photographs
// opt out of that one step and keep the rest of the grade. PhotoMaskPass draws
// every registered mesh into a mask the grade reads; everything else keeps the
// rebuild, and the room stays as saturated as it was.
//
// A photograph registers here rather than joining a camera layer: the pass
// never renders the room's scene, only its own proxies of these meshes, so it
// cannot disturb the room's lights, fog, background or override material.
// Book covers are art, not photographs, and never register.

const photographs = new Set<THREE.Mesh>();

/** Registers a photograph mesh for the mask and returns its release. */
export function registerPhotograph(mesh: THREE.Mesh): () => void {
  photographs.add(mesh);
  return () => {
    photographs.delete(mesh);
  };
}

/** Every photograph currently mounted, in registration order. */
export function photographMeshes(): ReadonlySet<THREE.Mesh> {
  return photographs;
}

/** The mask is rendered at half resolution: the pass clears a target every
 * frame, and a photograph's edge sits inside a frame or a mat, so the soft
 * edge of a smaller mask never shows. */
export const PHOTO_MASK_SCALE = 0.5;

/** The saturation a photograph keeps through the chroma rebuild: the file's
 * own. GRADE_FRAGMENT carries the same literal, and artifactShadeProbe.test.ts
 * pins the two together. */
export const PHOTOGRAPH_SATURATION = 1.0;
