import * as THREE from "three";

/** Material treatment for the packed background rows, independent of hover
 * and carrying. Source edge colors and the featured books stay untouched. */
export function subduedBookColor(source: string): string {
  const color = new THREE.Color(source);
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const warmGray = new THREE.Color().setRGB(
    luminance * 1.03,
    luminance,
    luminance * 0.94,
  );
  color.lerp(warmGray, 0.35);
  // Compress bright paper and boards into warm gray; dark ink keeps its
  // tonal differences. Work in linear light, as the materials do.
  color.multiplyScalar(0.84 / (1 + luminance));
  return `#${color.getHexString()}`;
}

/** Warm foil on dark bindings, brown ink on pale cloth or paper. */
export function bookSpineInk(source: string): string {
  const color = new THREE.Color(source);
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return luminance < 0.22 ? "#d8c49e" : "#403627";
}

let subdued = true;
let detailedSpines = true;
const listeners = new Set<() => void>();

export const backgroundBookTreatment = {
  getSnapshot: () => subdued,
  getDetailedSpines: () => detailedSpines,
  setDetailedSpines: (value: boolean) => {
    if (detailedSpines === value) return;
    detailedSpines = value;
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setSubdued: (value: boolean) => {
    if (subdued === value) return;
    subdued = value;
    for (const listener of listeners) listener();
  },
};
