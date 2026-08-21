import { describe, expect, it } from "vitest";

import {
  COORDINATION_CONNECTION_CAPACITY,
  COORDINATION_CORE_RADIUS,
  COORDINATION_GLOBE_RADIUS,
  COORDINATION_HOVER_TIME_SCALE,
  COORDINATION_INTERACTION_RADIUS,
  COORDINATION_NODE_COUNT,
  coordinationConnectionInterval,
  coordinationIdleConnectionInterval,
  coordinationMotionRate,
  coordinationNodePosition,
  createCoordinationBurst,
  createCoordinationConnection,
  createCoordinationConnectionPool,
  createCoordinationNetwork,
  stepCoordinationBurst,
  stepCoordinationConnection,
  stepCoordinationConnectionPool,
  triggerCoordinationBurst,
  triggerCoordinationConnection,
  triggerNextCoordinationConnection,
} from "./coordinationNetwork";

const radius = (point: readonly [number, number, number]) =>
  Math.hypot(point[0], point[1], point[2]);

describe("Coordination globe network", () => {
  it("turns the complete network markedly faster while engaged", () => {
    expect(COORDINATION_HOVER_TIME_SCALE).toBeGreaterThanOrEqual(3);
    expect(coordinationMotionRate(0)).toBe(1);
    expect(coordinationMotionRate(1)).toBe(COORDINATION_HOVER_TIME_SCALE);
    expect(coordinationMotionRate(0.5)).toBeGreaterThan(1);
    expect(coordinationMotionRate(0.5)).toBeLessThan(
      COORDINATION_HOVER_TIME_SCALE,
    );
  });

  it("builds one deterministic sphere rather than a flattened torus", () => {
    const graph = createCoordinationNetwork();

    expect(graph).toEqual(createCoordinationNetwork());
    expect(COORDINATION_NODE_COUNT).toBe(60);
    expect(graph.nodes).toHaveLength(COORDINATION_NODE_COUNT);
    expect(new Set(graph.nodes.map(({ theme }) => theme))).toEqual(
      new Set(["human", "agent"]),
    );
    const normalizedDepth = graph.nodes.map(
      ({ position }) => Math.abs(position[2]) / radius(position),
    );
    expect(Math.max(...normalizedDepth)).toBeGreaterThan(0.8);
    expect(
      graph.nodes.filter(({ position }) => position[2] > 0).length,
    ).toBeGreaterThan(COORDINATION_NODE_COUNT * 0.3);
    expect(
      graph.nodes.filter(({ position }) => position[2] < 0).length,
    ).toBeGreaterThan(COORDINATION_NODE_COUNT * 0.3);
    const radialDepths = graph.nodes.map(({ position }) => radius(position));
    expect(Math.min(...radialDepths)).toBeLessThan(
      COORDINATION_CORE_RADIUS * 0.15,
    );
    expect(
      radialDepths.filter(
        (nodeRadius) => nodeRadius < COORDINATION_CORE_RADIUS * 0.3,
      ).length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      radialDepths.filter(
        (nodeRadius) => nodeRadius > COORDINATION_CORE_RADIUS * 0.65,
      ).length,
    ).toBeGreaterThanOrEqual(24);
    const outerNodes = graph.nodes.filter(
      ({ position }) => radius(position) > COORDINATION_CORE_RADIUS * 0.65,
    );
    const occupiedOctants = new Set(
      outerNodes.map(
        ({ position: [x, y, z] }) =>
          (x >= 0 ? 1 : 0) | (y >= 0 ? 2 : 0) | (z >= 0 ? 4 : 0),
      ),
    );
    const projectedSectorCount = (leftAxis: number, rightAxis: number) =>
      new Set(
        outerNodes.map(({ position }) => {
          let angle = Math.atan2(position[rightAxis]!, position[leftAxis]!);
          if (angle < 0) angle += Math.PI * 2;
          return Math.floor(angle / ((Math.PI * 2) / 12));
        }),
      ).size;
    expect(occupiedOctants.size).toBe(8);
    expect(projectedSectorCount(0, 1)).toBeGreaterThanOrEqual(10);
    expect(projectedSectorCount(0, 2)).toBeGreaterThanOrEqual(10);
    expect(projectedSectorCount(1, 2)).toBeGreaterThanOrEqual(10);
    expect(graph.edges.length).toBeGreaterThan(COORDINATION_NODE_COUNT * 3);

    const edgeKeys = graph.edges.map(([from, to]) => `${from}:${to}`);
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length);
    for (const [from, to] of graph.edges) {
      expect(from).toBeLessThan(to);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThan(graph.nodes.length);
    }

    const localEdges = new Set(
      graph.edges.map(([from, to]) => `${from}:${to}`),
    );
    expect(graph.longConnections).toHaveLength(8);
    expect(new Set(graph.longConnections.flat()).size).toBe(16);
    for (const [from, to] of graph.longConnections)
      expect(localEdges.has(`${from}:${to}`)).toBe(false);
  });

  it("visibly rotates the spherical graph and returns from a burst", () => {
    const graph = createCoordinationNetwork();
    const rotationTravel: number[] = [];
    const innerTravel: number[] = [];

    expect(
      COORDINATION_CORE_RADIUS / COORDINATION_GLOBE_RADIUS,
    ).toBeGreaterThan(0.9);

    for (const node of graph.nodes) {
      const rest = coordinationNodePosition(node, 17, 0);
      const fourSecondsLater = coordinationNodePosition(node, 21, 0);
      const burst = coordinationNodePosition(node, 17, 1);

      expect(radius(rest)).toBeLessThan(COORDINATION_CORE_RADIUS);
      expect(radius(rest)).toBeGreaterThan(COORDINATION_CORE_RADIUS * 0.04);
      expect(radius(burst)).toBeGreaterThan(radius(rest));
      expect(radius(burst)).toBeLessThan(COORDINATION_CORE_RADIUS);
      rotationTravel.push(
        Math.hypot(
          fourSecondsLater[0] - rest[0],
          fourSecondsLater[1] - rest[1],
          fourSecondsLater[2] - rest[2],
        ),
      );
    }
    expect(
      rotationTravel.reduce((sum, travel) => sum + travel, 0) /
        rotationTravel.length,
    ).toBeGreaterThan(0.025);

    for (const [from, to] of graph.edges) {
      const firstStart = coordinationNodePosition(graph.nodes[from]!, 17, 0);
      const secondStart = coordinationNodePosition(graph.nodes[to]!, 17, 0);
      const firstEnd = coordinationNodePosition(graph.nodes[from]!, 20, 0);
      const secondEnd = coordinationNodePosition(graph.nodes[to]!, 20, 0);
      innerTravel.push(
        Math.abs(
          Math.hypot(
            firstEnd[0] - secondEnd[0],
            firstEnd[1] - secondEnd[1],
            firstEnd[2] - secondEnd[2],
          ) -
            Math.hypot(
              firstStart[0] - secondStart[0],
              firstStart[1] - secondStart[1],
              firstStart[2] - secondStart[2],
            ),
        ),
      );
    }
    expect(
      innerTravel.reduce((sum, travel) => sum + travel, 0) / innerTravel.length,
    ).toBeGreaterThan(0.002);

    const burstTravel = graph.nodes.map((node) => {
      const rest = coordinationNodePosition(node, 17, 0);
      const burst = coordinationNodePosition(node, 17, 1);
      return Math.hypot(
        burst[0] - rest[0],
        burst[1] - rest[1],
        burst[2] - rest[2],
      );
    });
    expect(Math.min(...burstTravel)).toBeGreaterThan(0.03);

    expect(COORDINATION_INTERACTION_RADIUS).toBeGreaterThanOrEqual(
      COORDINATION_CORE_RADIUS,
    );
    expect(
      COORDINATION_INTERACTION_RADIUS / COORDINATION_GLOBE_RADIUS,
    ).toBeLessThanOrEqual(1);

    const burst = createCoordinationBurst();
    expect(stepCoordinationBurst(burst, 1 / 60)).toBe(0);
    triggerCoordinationBurst(burst);
    const strengths: number[] = [];
    for (let frame = 0; frame < 240; frame += 1)
      strengths.push(stepCoordinationBurst(burst, 1 / 60));

    expect(strengths[0]).toBeGreaterThan(0);
    expect(Math.max(...strengths)).toBeGreaterThan(0.99);
    expect(strengths.at(-1)).toBe(0);
    expect(burst).toEqual({ age: null, strength: 0 });
    expect(
      coordinationNodePosition(graph.nodes[0]!, 17, burst.strength),
    ).toEqual(coordinationNodePosition(graph.nodes[0]!, 17, 0));
  });

  it("grows and fully clears a long-connection reveal", () => {
    const connection = createCoordinationConnection();

    expect(stepCoordinationConnection(connection, 1 / 60)).toEqual(connection);
    triggerCoordinationConnection(connection);
    const early = { ...stepCoordinationConnection(connection, 1 / 60) };
    for (let frame = 0; frame < 40; frame += 1)
      stepCoordinationConnection(connection, 1 / 60);
    const grown = { ...connection };

    expect(early.progress).toBeGreaterThan(0);
    expect(grown.progress).toBeGreaterThan(early.progress);
    expect(grown.progress).toBe(1);

    for (let frame = 0; frame < 120; frame += 1)
      stepCoordinationConnection(connection, 1 / 60);
    expect(connection).toEqual({
      age: null,
      sequence: 0,
      progress: 0,
      opacity: 0,
    });

    triggerCoordinationConnection(connection);
    expect(connection.sequence).toBe(1);
  });

  it("spaces hover connections between 0.15 and 0.75 seconds", () => {
    const intervals = Array.from({ length: 64 }, (_, sequence) =>
      coordinationConnectionInterval(sequence),
    );

    expect(intervals).toEqual(
      Array.from({ length: 64 }, (_, sequence) =>
        coordinationConnectionInterval(sequence),
      ),
    );
    expect(Math.min(...intervals)).toBeGreaterThanOrEqual(0.15);
    expect(Math.max(...intervals)).toBeLessThanOrEqual(0.75);
    expect(Math.max(...intervals) - Math.min(...intervals)).toBeGreaterThan(
      0.5,
    );
    expect(COORDINATION_CONNECTION_CAPACITY).toBeGreaterThanOrEqual(12);
  });

  it("keeps quieter connection activity alive without hover", () => {
    const intervals = Array.from({ length: 64 }, (_, sequence) =>
      coordinationIdleConnectionInterval(sequence),
    );

    expect(Math.min(...intervals)).toBeGreaterThanOrEqual(1.1);
    expect(Math.max(...intervals)).toBeLessThanOrEqual(3);
    expect(COORDINATION_CONNECTION_CAPACITY).toBeGreaterThanOrEqual(6);
  });

  it("keeps earlier hover connections alive when a new one begins", () => {
    const pool = createCoordinationConnectionPool();
    const first = triggerNextCoordinationConnection(pool);
    if (!first) throw new Error("first connection slot was unavailable");
    for (let frame = 0; frame < 36; frame += 1)
      stepCoordinationConnectionPool(pool, 1 / 60);
    const firstAge = first.age;
    const second = triggerNextCoordinationConnection(pool);
    if (!second) throw new Error("second connection slot was unavailable");

    expect(pool.slots).toHaveLength(COORDINATION_CONNECTION_CAPACITY);
    expect(first).not.toBe(second);
    expect(first.age).toBe(firstAge);
    expect(first.age).not.toBeNull();
    expect(second.age).toBe(0);
    expect(first.sequence).toBe(0);
    expect(second.sequence).toBe(1);

    for (let index = 0; index < 12; index += 1) {
      for (let frame = 0; frame < 30; frame += 1)
        stepCoordinationConnectionPool(pool, 1 / 60);
      expect(triggerNextCoordinationConnection(pool)).toBeDefined();
      expect(
        pool.slots.filter(({ age }) => age !== null).length,
      ).toBeLessThanOrEqual(COORDINATION_CONNECTION_CAPACITY);
    }
  });
});
