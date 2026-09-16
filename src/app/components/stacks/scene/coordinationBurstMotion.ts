import {
  COORDINATION_CORE_RADIUS,
  type CoordinationNode,
} from "./coordinationNetwork";

export const COORDINATION_FRAGMENT_DURATION = 1.1;
const DRAG = 3.2;
const GRAVITY = 0.65;

export type CoordinationFragmentSample = {
  x: number;
  y: number;
  z: number;
  scale: number;
};

/** Fragments leave at full speed, lose momentum, and fall. They never retrace
 * an expansion curve back into the orb. Writes into a reused frame sample. */
export function sampleCoordinationFragment(
  node: CoordinationNode,
  age: number,
  out: CoordinationFragmentSample,
) {
  const t = Math.max(0, Math.min(COORDINATION_FRAGMENT_DURATION, age));
  const [x, y, z] = node.position;
  const length = Math.max(1e-6, Math.hypot(x, y, z));
  const speed = 1.4 + node.burstReach * 3.4;
  const travel = (1 - Math.exp(-DRAG * t)) / DRAG;
  const radius = COORDINATION_CORE_RADIUS * 0.65 + speed * travel;
  out.x = (x / length) * radius;
  out.y = (y / length) * radius - 0.5 * GRAVITY * t * t;
  out.z = (z / length) * radius;
  const remaining = Math.max(0, 1 - t / COORDINATION_FRAGMENT_DURATION);
  out.scale = age < 0 ? 0 : remaining ** (0.7 + node.burstReach);
  return out;
}
