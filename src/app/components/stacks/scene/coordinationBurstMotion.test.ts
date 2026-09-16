import { describe, expect, it } from "vitest";

import {
  COORDINATION_FRAGMENT_DURATION,
  sampleCoordinationFragment,
} from "./coordinationBurstMotion";
import {
  COORDINATION_CORE_RADIUS,
  createCoordinationBurst,
  createCoordinationNetwork,
  stepCoordinationBurst,
  triggerCoordinationBurst,
} from "./coordinationNetwork";

const graph = createCoordinationNetwork();
const sample = (index: number, age: number) =>
  sampleCoordinationFragment(graph.nodes[index]!, age, {
    x: 0,
    y: 0,
    z: 0,
    scale: 0,
  });

describe("Coordination explosion", () => {
  it("releases sharply and sends fragments beyond the horizon", () => {
    const burst = createCoordinationBurst();
    triggerCoordinationBurst(burst);
    expect(stepCoordinationBurst(burst, 1 / 60)).toBeGreaterThan(0.8);
    for (let index = 0; index < graph.nodes.length; index += 1) {
      const fragment = sample(index, 0.08);
      expect(Math.hypot(fragment.x, fragment.y, fragment.z)).toBeGreaterThan(
        COORDINATION_CORE_RADIUS * 2,
      );
    }
  });

  it("loses momentum without pulling the fragments back into the orb", () => {
    for (let index = 0; index < graph.nodes.length; index += 1) {
      const distance = (age: number) => {
        const fragment = sample(index, age);
        return Math.hypot(fragment.x, fragment.z);
      };
      const launchTravel = distance(0.1) - distance(0);
      const lateTravel = distance(0.6) - distance(0.5);
      expect(lateTravel).toBeGreaterThan(0);
      expect(lateTravel).toBeLessThan(launchTravel * 0.3);
      expect(distance(1)).toBeGreaterThan(distance(0.6));
    }
    const radii = graph.nodes.map((_, index) => {
      const fragment = sample(index, 0.2);
      return Math.hypot(fragment.x, fragment.y, fragment.z);
    });
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.1);
  });

  it("falls under gravity and completely fades by the end", () => {
    const index = graph.nodes.findIndex((node) => node.position[1] < 0);
    expect(sample(index, 0.8).y).toBeLessThan(sample(index, 0.5).y);
    expect(sample(index, 0.8).scale).toBeLessThan(sample(index, 0.5).scale);
    expect(sample(index, COORDINATION_FRAGMENT_DURATION).scale).toBe(0);
    expect(sample(index, 10).scale).toBe(0);
  });
});
