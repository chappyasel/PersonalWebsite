export const COORDINATION_HUMAN_COLOR = "#34d399";
export const COORDINATION_AGENT_COLOR = "#4d9eff";
export const COORDINATION_GLOBE_INTERACTION_ID =
  "grab:coordination-research:about";
export const COORDINATION_NODE_COUNT = 60;
export const COORDINATION_CONNECTION_CAPACITY = 12;
export const COORDINATION_HOVER_TIME_SCALE = 3.25;
export const COORDINATION_INSECT_TIME_SCALE = 2;
export const COORDINATION_GLOBE_RADIUS = 0.105;
export const COORDINATION_CORE_RADIUS = 0.096;
export const COORDINATION_INTERACTION_RADIUS = COORDINATION_GLOBE_RADIUS;

export type CoordinationTheme = "human" | "agent";

export type CoordinationNode = Readonly<{
  position: readonly [number, number, number];
  theme: CoordinationTheme;
  phase: number;
  burstReach: number;
}>;

export type CoordinationEdge = readonly [number, number];

export type CoordinationNetwork = Readonly<{
  nodes: readonly CoordinationNode[];
  edges: readonly CoordinationEdge[];
  longConnections: readonly CoordinationEdge[];
}>;

export type CoordinationBurst = {
  age: number | null;
  strength: number;
};

export type CoordinationConnection = {
  age: number | null;
  sequence: number;
  progress: number;
  opacity: number;
};

export type CoordinationConnectionPool = {
  slots: CoordinationConnection[];
  cursor: number;
  nextSequence: number;
};

const BURST_ATTACK = 0.12;
const BURST_RELEASE = 1.05;
const CONNECTION_GROW = 0.58;
const CONNECTION_FADE = 1.05;
const NEIGHBORS_PER_NODE = 6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RADIAL_BANDS = [
  { count: 24, minRadius: 0.68, maxRadius: 0.91, phase: 0.2 },
  { count: 20, minRadius: 0.34, maxRadius: 0.7, phase: 2.1 },
  { count: 16, minRadius: 0.06, maxRadius: 0.38, phase: 4.2 },
] as const;

/** Integrate this rate into a private motion clock. Multiplying absolute
 * elapsed time would jump the sphere when hover begins or ends. */
export function coordinationMotionRate(activity: number) {
  const boundedActivity = Math.max(0, Math.min(1, activity));
  return 1 + (COORDINATION_HOVER_TIME_SCALE - 1) * boundedActivity;
}

function hash(index: number, salt: number) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43_758.5453;
  return x - Math.floor(x);
}

function distanceSquared(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  return (
    (left[0] - right[0]) ** 2 +
    (left[1] - right[1]) ** 2 +
    (left[2] - right[2]) ** 2
  );
}

/** A seeded, jittered sphere rather than a rerolled particle effect. Three
 * overlapping radial bands guarantee an inner population and outer coverage;
 * a golden-angle direction sequence prevents the large angular holes produced
 * by independent random samples. Each node gets six nearest neighbors, then
 * duplicate edges collapse into one segment. */
export function createCoordinationNetwork(): CoordinationNetwork {
  const nodes = Array.from({ length: COORDINATION_NODE_COUNT }, (_, index) => {
    const bandIndex = index < 24 ? 0 : index < 44 ? 1 : 2;
    const band = RADIAL_BANDS[bandIndex];
    const localIndex =
      index - (bandIndex === 0 ? 0 : bandIndex === 1 ? 24 : 44);
    const depth = 1 - (2 * (localIndex + 0.5)) / band.count;
    const azimuth =
      localIndex * GOLDEN_ANGLE + band.phase + (hash(index, 5) - 0.5) * 0.16;
    const lateral = Math.sqrt(Math.max(0, 1 - depth * depth));
    const sphereRadius =
      COORDINATION_CORE_RADIUS *
      (band.minRadius + hash(index, 7) * (band.maxRadius - band.minRadius));
    return {
      position: [
        Math.cos(azimuth) * lateral * sphereRadius,
        Math.sin(azimuth) * lateral * sphereRadius,
        depth * sphereRadius,
      ] as const,
      theme: (hash(index, 13) < 0.5 ? "human" : "agent") as CoordinationTheme,
      phase: hash(index, 19) * Math.PI * 2,
      burstReach: 0.28 + hash(index, 23) * 0.34,
    } satisfies CoordinationNode;
  });
  const keys = new Set<string>();
  const edges: CoordinationEdge[] = [];
  nodes.forEach((node, index) => {
    const nearest = nodes
      .map((other, otherIndex) => ({
        otherIndex,
        distance:
          otherIndex === index
            ? Infinity
            : distanceSquared(node.position, other.position),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, NEIGHBORS_PER_NODE);
    for (const { otherIndex } of nearest) {
      const from = Math.min(index, otherIndex);
      const to = Math.max(index, otherIndex);
      const key = `${from}:${to}`;
      if (keys.has(key)) continue;
      keys.add(key);
      edges.push([from, to]);
    }
  });
  const edgeKeys = new Set(edges.map(([from, to]) => `${from}:${to}`));
  const candidates: Array<{
    edge: CoordinationEdge;
    distance: number;
  }> = [];
  for (let from = 0; from < nodes.length; from += 1) {
    for (let to = from + 1; to < nodes.length; to += 1) {
      if (edgeKeys.has(`${from}:${to}`)) continue;
      candidates.push({
        edge: [from, to],
        distance: distanceSquared(nodes[from]!.position, nodes[to]!.position),
      });
    }
  }
  candidates.sort(
    (left, right) =>
      right.distance - left.distance ||
      left.edge[0] - right.edge[0] ||
      left.edge[1] - right.edge[1],
  );
  // Greedily choose far-apart pairs without reusing endpoints. Hover then
  // reveals a genuinely improbable introduction instead of repainting one of
  // the neighborhood links that was already visible.
  const used = new Set<number>();
  const longConnections: CoordinationEdge[] = [];
  for (const { edge } of candidates) {
    if (used.has(edge[0]) || used.has(edge[1])) continue;
    longConnections.push(edge);
    used.add(edge[0]);
    used.add(edge[1]);
    if (longConnections.length === 8) break;
  }
  return { nodes, edges, longConnections };
}

/** A legible rigid-body rotation plus a bounded radial burst. The graph is deliberately
 * inside the event horizon; its material ignores ordinary depth so it remains
 * the sole legible structure where opaque geometry should hide it. */
export function coordinationNodePosition(
  node: CoordinationNode,
  elapsed: number,
  burstStrength: number,
): [number, number, number] {
  const burst = Math.max(0, Math.min(1, burstStrength));
  const [x, y, z] = node.position;
  const restLength = Math.max(1e-6, Math.hypot(x, y, z));
  const breathe = 1 + Math.sin(elapsed * 0.34 + node.phase) * 0.022;
  const idleRadius = restLength * breathe;
  const burstRadius =
    COORDINATION_CORE_RADIUS * (0.91 + node.burstReach * 0.06);
  const radius = idleRadius + (burstRadius - idleRadius) * burst;
  const directionX = x / restLength;
  const directionY = y / restLength;
  const directionZ = z / restLength;
  // The phase vector is crossed with the node direction, producing a
  // guaranteed tangent rather than a random offset that can accidentally
  // point straight back along the same radius.
  const phaseX = Math.cos(node.phase * 1.31);
  const phaseY = Math.sin(node.phase * 1.73);
  const phaseZ = Math.cos(node.phase * 0.91 + 0.7);
  let tangentX = directionY * phaseZ - directionZ * phaseY;
  let tangentY = directionZ * phaseX - directionX * phaseZ;
  let tangentZ = directionX * phaseY - directionY * phaseX;
  let tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
  if (tangentLength < 1e-5) {
    tangentX = -directionY;
    tangentY = directionX;
    tangentZ = 0;
    tangentLength = Math.max(1e-5, Math.hypot(tangentX, tangentY));
  }
  tangentX /= tangentLength;
  tangentY /= tangentLength;
  tangentZ /= tangentLength;
  // Nodes circulate within the rotating sphere even at rest. Shared yaw and
  // pitch make the whole graph legible as one object; this smaller per-node
  // tangent motion keeps its inner topology alive instead of freezing it into
  // a rigid wire cage between interactions.
  const innerRate = 0.42 + node.burstReach * 0.46;
  const innerAngle = Math.sin(elapsed * innerRate + node.phase) * 0.15;
  const burstAngle = 0.5 + node.burstReach * 0.34;
  const scatterAngle = innerAngle + (burstAngle - innerAngle) * burst;
  const scatterCos = Math.cos(scatterAngle);
  const scatterSin = Math.sin(scatterAngle);
  const scatteredX = (directionX * scatterCos + tangentX * scatterSin) * radius;
  const scatteredY = (directionY * scatterCos + tangentY * scatterSin) * radius;
  const scatteredZ = (directionZ * scatterCos + tangentZ * scatterSin) * radius;

  // Every point shares these axes, so edges read as one rotating object
  // rather than sixty unrelated points slowly changing shape.
  const yaw = elapsed * 0.24;
  const yawCos = Math.cos(yaw);
  const yawSin = Math.sin(yaw);
  const yawX = scatteredX * yawCos + scatteredZ * yawSin;
  const yawZ = -scatteredX * yawSin + scatteredZ * yawCos;
  const pitch = elapsed * 0.11;
  const pitchCos = Math.cos(pitch);
  const pitchSin = Math.sin(pitch);
  return [
    yawX,
    scatteredY * pitchCos - yawZ * pitchSin,
    scatteredY * pitchSin + yawZ * pitchCos,
  ];
}

export function createCoordinationBurst(): CoordinationBurst {
  return { age: null, strength: 0 };
}

export function triggerCoordinationBurst(burst: CoordinationBurst) {
  burst.age = 0;
  burst.strength = 0;
}

/** A legible attack followed by a complete return to the authored graph. */
export function stepCoordinationBurst(
  burst: CoordinationBurst,
  delta: number,
): number {
  if (burst.age === null) return 0;
  burst.age += Math.max(0, Math.min(delta, 1 / 15));
  if (burst.age <= BURST_ATTACK) {
    const t = burst.age / BURST_ATTACK;
    burst.strength = 1 - (1 - t) ** 3;
    return burst.strength;
  }
  const release = (burst.age - BURST_ATTACK) / BURST_RELEASE;
  if (release >= 1) {
    burst.age = null;
    burst.strength = 0;
    return 0;
  }
  burst.strength = (1 - release) ** 1.35;
  return burst.strength;
}

export function createCoordinationConnection(): CoordinationConnection {
  return { age: null, sequence: -1, progress: 0, opacity: 0 };
}

export function triggerCoordinationConnection(
  connection: CoordinationConnection,
  sequence = connection.sequence + 1,
) {
  connection.age = 0;
  connection.sequence = sequence;
  connection.progress = 0;
  connection.opacity = 0;
}

export function createCoordinationConnectionPool(): CoordinationConnectionPool {
  return {
    slots: Array.from(
      { length: COORDINATION_CONNECTION_CAPACITY },
      createCoordinationConnection,
    ),
    cursor: 0,
    nextSequence: 0,
  };
}

/** Claim an inactive slot. Twelve slots cover the maximum overlap implied by
 * a 0.15-second cadence and the authored 1.63-second reveal lifetime. */
export function triggerNextCoordinationConnection(
  pool: CoordinationConnectionPool,
): CoordinationConnection | undefined {
  for (let offset = 0; offset < pool.slots.length; offset += 1) {
    const index = (pool.cursor + offset) % pool.slots.length;
    const connection = pool.slots[index]!;
    if (connection.age !== null) continue;
    triggerCoordinationConnection(connection, pool.nextSequence);
    pool.nextSequence += 1;
    pool.cursor = (index + 1) % pool.slots.length;
    return connection;
  }
  return undefined;
}

export function stepCoordinationConnectionPool(
  pool: CoordinationConnectionPool,
  delta: number,
): readonly CoordinationConnection[] {
  for (const connection of pool.slots)
    stepCoordinationConnection(connection, delta);
  return pool.slots;
}

/** Deterministic hover rhythm with enough variation to feel alive without
 * turning a tiny shelf object into a metronome. */
export function coordinationConnectionInterval(sequence: number): number {
  return 0.15 + hash(Math.max(0, sequence), 41) * 0.6;
}

/** The graph keeps making quieter introductions without a pointer. */
export function coordinationIdleConnectionInterval(sequence: number): number {
  return 1.1 + hash(Math.max(0, sequence), 47) * 1.9;
}

/** The local equivalent of Coordination's `fireFlip`: grow one long chord,
 * hold it just long enough to register, then remove it completely. */
export function stepCoordinationConnection(
  connection: CoordinationConnection,
  delta: number,
): CoordinationConnection {
  if (connection.age === null) return connection;
  connection.age += Math.max(0, Math.min(delta, 1 / 15));
  const grow = Math.min(1, connection.age / CONNECTION_GROW);
  connection.progress = 1 - (1 - grow) ** 3;
  connection.opacity = Math.min(1, connection.age / 0.08);
  if (connection.age > CONNECTION_GROW) {
    const fade = (connection.age - CONNECTION_GROW) / CONNECTION_FADE;
    if (fade >= 1) {
      connection.age = null;
      connection.progress = 0;
      connection.opacity = 0;
      return connection;
    }
    connection.opacity = 1 - fade;
  }
  return connection;
}
