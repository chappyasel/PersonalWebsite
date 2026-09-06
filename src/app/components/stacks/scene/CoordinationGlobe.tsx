"use client";

import { sceneAudio } from "../audio/sceneAudio";
import { isWorldRevealed } from "../boot/worldBootSession";
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { useStacks } from "../store";
import { type Palette } from "../theme";
import { useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import Grabbable from "./Grabbable";
import { aboutLandmarkNodeName } from "./aboutBootComposition";
import { coordinationGlobeDiagnosticsController } from "./coordinationGlobeDiagnostics";
import {
  COORDINATION_BASE_BOTTOM_RADIUS,
  COORDINATION_BASE_CENTER_Y,
  COORDINATION_BASE_HEIGHT,
  COORDINATION_BASE_TOP_RADIUS,
  COORDINATION_CORE_CENTER_Y,
  COORDINATION_HORIZON_SCALE,
  COORDINATION_NECK_SCALE,
  COORDINATION_NETWORK_SCALE,
  COORDINATION_PLINTH_SCALE,
  COORDINATION_STEM_BOTTOM_RADIUS,
  COORDINATION_STEM_CENTER_Y,
  COORDINATION_STEM_HEIGHT,
  COORDINATION_STEM_TOP_RADIUS,
} from "./coordinationGlobeGeometry";
import {
  type CoordinationGlobeLegibility,
  coordinationGlobeLegibility,
} from "./coordinationGlobeLegibility";
import {
  COORDINATION_AGENT_COLOR,
  COORDINATION_CONNECTION_CAPACITY,
  COORDINATION_CORE_RADIUS,
  COORDINATION_GLOBE_INTERACTION_ID,
  COORDINATION_HUMAN_COLOR,
  COORDINATION_INTERACTION_RADIUS,
  type CoordinationBurst,
  type CoordinationConnection,
  coordinationConnectionInterval,
  coordinationIdleConnectionInterval,
  coordinationMotionRate,
  coordinationNodePosition,
  createCoordinationBurst,
  createCoordinationConnectionPool,
  createCoordinationNetwork,
  stepCoordinationBurst,
  stepCoordinationConnectionPool,
  triggerCoordinationBurst,
  triggerNextCoordinationConnection,
} from "./coordinationNetwork";
import { publishMeadowPhysicalEvent } from "./meadowDisturbance";
import { publishSceneImpulse } from "./sceneImpulse";
import { screenshotModeController } from "./screenshotMode";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { useUnitFrame } from "./unitActivity";

const HORIZON_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  varying float vEdgeNoise;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += vec3(dot(p, p.yzx + vec3(33.33)));
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    return noise3(p) * 0.55
      + noise3(p * 2.03 + vec3(11.7)) * 0.28
      + noise3(p * 4.11 + vec3(23.4)) * 0.17;
  }

  void main() {
    vec3 direction = normalize(position);
    float time = uTime * (0.085 + uActivity * 0.09);
    float broadNoise = fbm(
      direction * 2.7 + vec3(time, -time * 0.71, time * 0.47)
    );
    float detailNoise = fbm(
      direction * 7.4 + vec3(-time * 1.4, time * 0.83, time * 1.17)
    );
    float ripple = sin(direction.y * 17.0 + uTime * (0.19 + uActivity * 0.31))
      * sin(direction.x * 13.0 - uTime * (0.14 + uActivity * 0.23));
    float displacement = (broadNoise - 0.48) * (0.20 + uActivity * 0.16)
      + (detailNoise - 0.5) * (0.075 + uActivity * 0.065)
      + ripple * (0.022 + uActivity * 0.026);
    vec3 displaced = position * (1.0 + displacement);
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vEdgeNoise = clamp(
      broadNoise * 0.62 + detailNoise * 0.38 + ripple * 0.07,
      0.0,
      1.0
    );
    vViewNormal = normalize(normalMatrix * direction);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const HORIZON_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  uniform float uDitherBandCoverage;
  uniform float uDitherCellSize;
  varying float vEdgeNoise;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  float edgeGrain(vec2 point) {
    vec3 p = fract(vec3(point.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    float facing = abs(dot(normalize(vViewNormal), normalize(vViewPosition)));
    float breathing = sin(
      uTime * (0.27 + uActivity * 0.48) + vEdgeNoise * 11.0
    ) * 0.5 + 0.5;
    float tendril = sin(
      vEdgeNoise * 29.0 - uTime * (0.8 + uActivity * 1.9)
    );
    float organicStart = -0.012 + (vEdgeNoise - 0.5) * 0.09
      + breathing * 0.018;
    float organicEnd = uDitherBandCoverage + (vEdgeNoise - 0.5) * 0.13
      + breathing * (0.035 + uActivity * 0.02);
    float organicCoverage = smoothstep(organicStart, organicEnd, facing);
    organicCoverage += tendril
      * (1.0 - smoothstep(0.14, 0.58, facing))
      * (0.10 + uActivity * 0.14);
    organicCoverage = clamp(organicCoverage, 0.0, 1.0);
    float ditherCellSize = mix(
      uDitherCellSize,
      uDitherCellSize * 0.75,
      uActivity
    );
    vec2 screenPoint = gl_FragCoord.xy;
    float flowTime = uTime * (0.24 + uActivity * 0.31);
    vec2 broadCurrent = vec2(
      sin(flowTime + screenPoint.y * 0.014),
      cos(flowTime * 0.79 - screenPoint.x * 0.011)
    ) * ditherCellSize * (1.6 + uActivity * 1.8);
    vec2 counterCurrent = vec2(
      cos(flowTime * 1.37 - screenPoint.y * 0.027),
      sin(flowTime * 1.11 + screenPoint.x * 0.023)
    ) * ditherCellSize * (0.75 + uActivity);

    vec2 clumpCell = floor(
      (screenPoint + broadCurrent * 0.38 - counterCurrent * 0.24)
        / (uDitherCellSize * 3.5)
    );
    float clumpSeed = edgeGrain(clumpCell + vec2(19.1, -7.4));
    float clumpRate = mix(
      0.72,
      1.0,
      edgeGrain(clumpCell + vec2(-31.7, 12.6))
    );

    // Two to eight-and-a-half authored grain states per second retain the
    // deliberate rhythm. Each coarse patch owns a different rate and starts at
    // a distant phase, removing the master beat from the complete silhouette.
    float grainClock = uTime * (2.0 + uActivity * 6.5) * clumpRate
      + clumpSeed * 23.0;
    float grainState = floor(grainClock);
    float transitionStart = mix(
      0.42,
      0.78,
      edgeGrain(
        clumpCell
          + vec2(grainState * 0.17 + 5.3, -grainState * 0.23 - 11.8)
      )
    );
    float grainBlend = smoothstep(
      transitionStart,
      1.0,
      fract(grainClock)
    );
    float currentPhase = mod(grainState, 16384.0) * 2.39996323;
    float nextPhase = mod(grainState + 1.0, 16384.0) * 2.39996323;
    vec2 currentOffset = vec2(cos(currentPhase), sin(currentPhase))
      * (5.0 + uActivity * 3.0);
    vec2 nextOffset = vec2(cos(nextPhase), sin(nextPhase))
      * (5.0 + uActivity * 3.0);
    vec2 fineCell = floor(
      (screenPoint + broadCurrent + counterCurrent) / ditherCellSize
    );
    vec2 broadCell = floor(
      (screenPoint - broadCurrent * 0.63 + counterCurrent * 0.41)
        / (uDitherCellSize * 2.0)
    );
    float currentDetail = mix(
      edgeGrain(fineCell + currentOffset),
      edgeGrain(broadCell - currentOffset * 0.37),
      0.34
    );
    float nextDetail = mix(
      edgeGrain(fineCell + nextOffset),
      edgeGrain(broadCell - nextOffset * 0.37),
      0.34
    );
    float currentClump = edgeGrain(clumpCell + currentOffset * 0.19);
    float nextClump = edgeGrain(clumpCell + nextOffset * 0.19);
    float currentGrain = mix(currentDetail, currentClump, 0.3);
    float nextGrain = mix(nextDetail, nextClump, 0.3);
    float temporalGrain = mix(currentGrain, nextGrain, grainBlend);
    if (temporalGrain > organicCoverage) discard;

    float edgeLift = (1.0 - smoothstep(0.06, 0.52, facing))
      * (0.0015 + vEdgeNoise * 0.0035);
    gl_FragColor = vec4(vec3(edgeLift), 1.0);
  }
`;

type BurstSignal = MutableRefObject<CoordinationBurst>;
type HorizonMaterialRef = RefObject<THREE.ShaderMaterial | null>;

const NETWORK_LINE_WIDTH_PX = 1;
const REVEAL_LINE_WIDTH_PX = 3.4;
const REVEAL_COLOR_INTENSITY = 1.6;
const NO_RAYCAST = () => null;
const COORDINATION_STENCIL_REF = 1;
const HORIZON_STENCIL_MATERIAL_PROPS = {
  stencilWrite: true,
  stencilRef: COORDINATION_STENCIL_REF,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
} as const;
const NETWORK_STENCIL_MATERIAL_PROPS = {
  stencilWrite: true,
  stencilRef: COORDINATION_STENCIL_REF,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
} as const;

function useCoordinationLegibility() {
  const gl = useThree((state) => state.gl);
  const cssWidth = useThree((state) => state.size.width);
  const cssHeight = useThree((state) => state.size.height);
  const requestedDpr = useThree((state) => state.viewport.dpr);
  return useMemo(() => {
    const rendererDpr = gl.getPixelRatio();
    const dpr =
      Number.isFinite(rendererDpr) && rendererDpr > 0
        ? rendererDpr
        : requestedDpr;
    return coordinationGlobeLegibility(
      (cssWidth * cssHeight * dpr * dpr) / 1_000_000,
    );
  }, [cssHeight, cssWidth, gl, requestedDpr]);
}

function screenSpaceLineMaterial({
  opacity,
  vertexColors,
  width,
}: {
  opacity: number;
  vertexColors: boolean;
  width: number;
}) {
  const material = new LineMaterial({
    alphaToCoverage: true,
    color: "#ffffff",
    depthTest: false,
    depthWrite: false,
    opacity,
    toneMapped: false,
    transparent: true,
    vertexColors,
    worldUnits: false,
  });
  Object.assign(material, NETWORK_STENCIL_MATERIAL_PROPS);
  material.uniforms.linewidth!.value = width;
  return material;
}

type NetworkScene = Readonly<{
  graph: ReturnType<typeof createCoordinationNetwork>;
  lines: LineSegments2;
  nodes: RefObject<THREE.InstancedMesh | null>;
  connectionLines: readonly Readonly<{
    material: LineMaterial;
    object: LineSegments2;
    positions: Float32Array;
    tip: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
    tipMaterial: THREE.MeshBasicMaterial;
  }>[];
  draw: (
    elapsed: number,
    hoverStrength: number,
    burstStrength: number,
    connections: readonly CoordinationConnection[],
  ) => void;
}>;

function useNetworkScene(
  legibility: CoordinationGlobeLegibility,
): NetworkScene {
  const graph = useMemo(() => createCoordinationNetwork(), []);
  const nodes = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const connectionStart = useMemo(() => new THREE.Vector3(), []);
  const connectionEnd = useMemo(() => new THREE.Vector3(), []);
  const points = useMemo(
    () => graph.nodes.map(() => new THREE.Vector3()),
    [graph.nodes],
  );
  const neighborhood = useMemo(() => {
    const positions = new Float32Array(graph.edges.length * 2 * 3);
    const colors = new Float32Array(graph.edges.length * 2 * 3);
    graph.edges.forEach(([from, to], edgeIndex) => {
      const fromColor = new THREE.Color(
        graph.nodes[from]!.theme === "human"
          ? COORDINATION_HUMAN_COLOR
          : COORDINATION_AGENT_COLOR,
      );
      const toColor = new THREE.Color(
        graph.nodes[to]!.theme === "human"
          ? COORDINATION_HUMAN_COLOR
          : COORDINATION_AGENT_COLOR,
      );
      colors.set(fromColor.toArray(), edgeIndex * 6);
      colors.set(toColor.toArray(), edgeIndex * 6 + 3);
    });
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);
    const material = screenSpaceLineMaterial({
      opacity: 0.27,
      vertexColors: true,
      width: NETWORK_LINE_WIDTH_PX,
    });
    const object = new LineSegments2(geometry, material);
    object.name = "coordination-neighborhood-lines";
    object.userData.physicsIgnore = true;
    object.frustumCulled = false;
    object.renderOrder = 9;
    return { material, object, positions };
  }, [graph]);
  const connectionTipGeometry = useMemo(
    () => new THREE.IcosahedronGeometry(0.0062, 1),
    [],
  );
  const connectionLines = useMemo(
    () =>
      Array.from({ length: COORDINATION_CONNECTION_CAPACITY }, (_, index) => {
        const positions = new Float32Array(6);
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);
        const material = screenSpaceLineMaterial({
          opacity: 0,
          vertexColors: false,
          width: REVEAL_LINE_WIDTH_PX,
        });
        const object = new LineSegments2(geometry, material);
        object.name = "coordination-connection-reveal";
        object.userData.connectionSlot = index;
        object.userData.physicsIgnore = true;
        object.visible = false;
        object.frustumCulled = false;
        object.renderOrder = 11;
        const tipMaterial = new THREE.MeshBasicMaterial({
          color: "#ffffff",
          depthTest: false,
          depthWrite: false,
          opacity: 0,
          toneMapped: false,
          transparent: true,
        });
        Object.assign(tipMaterial, NETWORK_STENCIL_MATERIAL_PROPS);
        const tip = new THREE.Mesh(connectionTipGeometry, tipMaterial);
        tip.name = "coordination-connection-tip";
        tip.userData.connectionSlot = index;
        tip.userData.physicsIgnore = true;
        tip.visible = false;
        tip.frustumCulled = false;
        tip.renderOrder = 12;
        return { material, object, positions, tip, tipMaterial };
      }),
    [connectionTipGeometry],
  );
  useEffect(
    () => () => {
      neighborhood.object.geometry.dispose();
      neighborhood.material.dispose();
      connectionTipGeometry.dispose();
      for (const connection of connectionLines) {
        connection.object.geometry.dispose();
        connection.material.dispose();
        connection.tipMaterial.dispose();
      }
    },
    [connectionLines, connectionTipGeometry, neighborhood],
  );

  const draw = useCallback(
    (
      elapsed: number,
      hoverStrength: number,
      burstStrength: number,
      connections: readonly CoordinationConnection[],
    ) => {
      const instanced = nodes.current;
      graph.nodes.forEach((node, index) => {
        const point = coordinationNodePosition(node, elapsed, burstStrength);
        points[index]!.set(point[0], point[1], point[2]);
        const depth = THREE.MathUtils.clamp(
          0.5 + points[index]!.z / (COORDINATION_CORE_RADIUS * 2),
          0,
          1,
        );
        const scale =
          (0.00235 + (index % 4) * 0.00016) *
          (0.84 + depth * 0.28) *
          (1 + burstStrength * 0.7) *
          legibility.nodeScale;
        if (instanced) {
          matrix.makeScale(scale, scale, scale);
          matrix.setPosition(points[index]!);
          instanced.setMatrixAt(index, matrix);
        }
      });
      if (instanced) {
        instanced.instanceMatrix.needsUpdate = true;
        if (!instanced.instanceColor) {
          graph.nodes.forEach((node, index) => {
            instanced.setColorAt(
              index,
              color.set(
                node.theme === "human"
                  ? COORDINATION_HUMAN_COLOR
                  : COORDINATION_AGENT_COLOR,
              ),
            );
          });
          const updatedColors =
            instanced.instanceColor as THREE.InstancedBufferAttribute | null;
          if (updatedColors) updatedColors.needsUpdate = true;
        }
      }
      graph.edges.forEach(([from, to], edgeIndex) => {
        const left = points[from]!;
        const right = points[to]!;
        const offset = edgeIndex * 6;
        neighborhood.positions[offset] = left.x;
        neighborhood.positions[offset + 1] = left.y;
        neighborhood.positions[offset + 2] = left.z;
        neighborhood.positions[offset + 3] = right.x;
        neighborhood.positions[offset + 4] = right.y;
        neighborhood.positions[offset + 5] = right.z;
      });
      const neighborhoodBuffer = (
        neighborhood.object.geometry.getAttribute(
          "instanceStart",
        ) as THREE.InterleavedBufferAttribute
      ).data;
      neighborhoodBuffer.needsUpdate = true;
      neighborhood.material.opacity =
        legibility.baseLineOpacity +
        hoverStrength * 0.07 +
        burstStrength * 0.26;

      connectionLines.forEach((visual, index) => {
        const connection = connections[index];
        const pair =
          connection && connection.sequence >= 0
            ? graph.longConnections[
                connection.sequence % graph.longConnections.length
              ]
            : undefined;
        const revealVisible =
          !!pair && !!connection && connection.opacity > 0.001;
        visual.object.visible = revealVisible;
        visual.tip.visible = revealVisible;
        if (!revealVisible || !pair || !connection) return;
        connectionStart.copy(points[pair[0]]!);
        connectionEnd
          .copy(points[pair[1]]!)
          .sub(connectionStart)
          .multiplyScalar(connection.progress)
          .add(connectionStart);
        visual.positions[0] = connectionStart.x;
        visual.positions[1] = connectionStart.y;
        visual.positions[2] = connectionStart.z;
        visual.positions[3] = connectionEnd.x;
        visual.positions[4] = connectionEnd.y;
        visual.positions[5] = connectionEnd.z;
        const connectionBuffer = (
          visual.object.geometry.getAttribute(
            "instanceStart",
          ) as THREE.InterleavedBufferAttribute
        ).data;
        connectionBuffer.needsUpdate = true;
        visual.tip.position.copy(connectionEnd);
        const theme = graph.nodes[pair[0]]!.theme;
        const revealColor =
          theme === "human"
            ? COORDINATION_HUMAN_COLOR
            : COORDINATION_AGENT_COLOR;
        visual.material.color
          .set(revealColor)
          .multiplyScalar(REVEAL_COLOR_INTENSITY);
        const revealStrength = 0.9 + hoverStrength * 0.1;
        visual.material.opacity = connection.opacity * revealStrength;
        visual.tipMaterial.color
          .set(revealColor)
          .multiplyScalar(REVEAL_COLOR_INTENSITY);
        visual.tipMaterial.opacity = connection.opacity * revealStrength;
      });
    },
    [
      color,
      connectionEnd,
      connectionLines,
      connectionStart,
      graph,
      legibility.baseLineOpacity,
      legibility.nodeScale,
      matrix,
      neighborhood,
      points,
    ],
  );

  useLayoutEffect(() => {
    neighborhood.material.uniforms.linewidth!.value =
      legibility.baseLineWidthPx;
    for (const connection of connectionLines)
      connection.material.uniforms.linewidth!.value =
        legibility.revealLineWidthPx;
  }, [
    connectionLines,
    legibility.baseLineWidthPx,
    legibility.revealLineWidthPx,
    neighborhood.material.uniforms,
  ]);
  useLayoutEffect(() => draw(0, 0, 0, []), [draw]);
  return {
    graph,
    lines: neighborhood.object,
    nodes,
    connectionLines,
    draw,
  };
}

function NetworkMeshes({ scene }: { scene: NetworkScene }) {
  return (
    <group name="coordination-network">
      <instancedMesh
        ref={scene.nodes}
        args={[undefined, undefined, scene.graph.nodes.length]}
        frustumCulled={false}
        raycast={NO_RAYCAST}
        renderOrder={10}
        userData={{ physicsIgnore: true }}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          {...NETWORK_STENCIL_MATERIAL_PROPS}
          vertexColors
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <primitive object={scene.lines} raycast={NO_RAYCAST} />
      {scene.connectionLines.map((connection, index) => (
        <group key={index}>
          <primitive object={connection.object} raycast={NO_RAYCAST} />
          <primitive object={connection.tip} raycast={NO_RAYCAST} />
        </group>
      ))}
    </group>
  );
}

function StaticCoordinationNetwork({
  legibility,
}: {
  legibility: CoordinationGlobeLegibility;
}) {
  const scene = useNetworkScene(legibility);
  return <NetworkMeshes scene={scene} />;
}

function LiveCoordinationNetwork({
  burstSignal,
  horizonMaterial,
  legibility,
}: {
  burstSignal: BurstSignal;
  horizonMaterial: HorizonMaterialRef;
  legibility: CoordinationGlobeLegibility;
}) {
  const scene = useNetworkScene(legibility);
  const coordinationEngaged = useStacks(
    (state) =>
      state.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID ||
      state.hovered === COORDINATION_GLOBE_INTERACTION_ID ||
      state.dragging === COORDINATION_GLOBE_INTERACTION_ID,
  );
  const activity = useRef(0);
  const motionTime = useRef(0);
  const wasEngaged = useRef(false);
  const connectionPool = useRef(createCoordinationConnectionPool());
  const nextConnectionIn = useRef(0);
  useUnitFrame(({ clock }, delta) => {
    // The boot SVG projects the network at t=0. Keep the hidden WebGL graph at
    // that same pose until the handoff begins, then advance its private clock
    // from zero. Canvas compile time can no longer decide the first visible
    // network arrangement.
    if (!isWorldRevealed()) {
      const timeUniform = horizonMaterial.current?.uniforms.uTime;
      if (timeUniform) timeUniform.value = 0;
      scene.draw(0, 0, 0, []);
      return;
    }
    const boundedDelta = Math.min(delta, 1 / 30);
    const motionDelta = Math.max(0, Math.min(delta, 0.1));
    const timeUniform = horizonMaterial.current?.uniforms.uTime;
    if (timeUniform) timeUniform.value = clock.elapsedTime;
    activity.current = THREE.MathUtils.damp(
      activity.current,
      coordinationEngaged ? 1 : 0,
      4.2,
      motionDelta,
    );
    motionTime.current +=
      motionDelta * coordinationMotionRate(activity.current);
    const activityUniform = horizonMaterial.current?.uniforms.uActivity;
    if (activityUniform) activityUniform.value = activity.current;
    if (coordinationEngaged && !wasEngaged.current) {
      const started = triggerNextCoordinationConnection(connectionPool.current);
      nextConnectionIn.current = coordinationConnectionInterval(
        started?.sequence ?? connectionPool.current.nextSequence,
      );
    } else {
      // Both rhythms follow wall time, not the clamped simulation step, so a
      // slower device does not silently double their interval. Hover is the
      // urgent rhythm; idle still makes quieter introductions on its own.
      nextConnectionIn.current -= Math.max(0, delta);
      if (nextConnectionIn.current <= 0) {
        const started = triggerNextCoordinationConnection(
          connectionPool.current,
        );
        const sequence =
          started?.sequence ?? connectionPool.current.nextSequence;
        nextConnectionIn.current = coordinationEngaged
          ? coordinationConnectionInterval(sequence)
          : coordinationIdleConnectionInterval(sequence);
      }
    }
    wasEngaged.current = coordinationEngaged;
    const burstStrength = stepCoordinationBurst(
      burstSignal.current,
      boundedDelta,
    );
    const connectionFrames = stepCoordinationConnectionPool(
      connectionPool.current,
      boundedDelta,
    );
    scene.draw(
      motionTime.current,
      activity.current,
      burstStrength,
      // Screenshot mode keeps the fine neighbourhood mesh and drops the
      // thick reveal arcs: at 3.4px they are the one thing on the globe
      // that reads as a line in a still, and a header wants the sphere.
      screenshotModeController.getSnapshot().enabled ? [] : connectionFrames,
    );
  });
  return <NetworkMeshes scene={scene} />;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function CoordinationNetwork({
  still,
  burstSignal,
  horizonMaterial,
  legibility,
}: {
  still: boolean;
  burstSignal: BurstSignal;
  horizonMaterial: HorizonMaterialRef;
  legibility: CoordinationGlobeLegibility;
}) {
  return still ? (
    <StaticCoordinationNetwork legibility={legibility} />
  ) : (
    <LiveCoordinationNetwork
      burstSignal={burstSignal}
      horizonMaterial={horizonMaterial}
      legibility={legibility}
    />
  );
}

function AmorphousHorizon({
  materialRef,
  legibility,
}: {
  materialRef: HorizonMaterialRef;
  legibility: CoordinationGlobeLegibility;
}) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0 },
      uDitherBandCoverage: { value: legibility.ditherBandCoverage },
      uDitherCellSize: { value: legibility.ditherCellPx },
    }),
    [legibility.ditherBandCoverage, legibility.ditherCellPx],
  );
  return (
    <mesh
      name="coordination-event-horizon"
      raycast={NO_RAYCAST}
      renderOrder={6}
      scale={COORDINATION_HORIZON_SCALE}
    >
      <icosahedronGeometry args={[COORDINATION_CORE_RADIUS, 4]} />
      <shaderMaterial
        {...HORIZON_STENCIL_MATERIAL_PROPS}
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={HORIZON_VERTEX}
        fragmentShader={HORIZON_FRAGMENT}
        // The graph deliberately ignores depth below, but the event horizon
        // must still own these pixels in the composer depth buffer. Otherwise
        // DoF classifies the graph using whichever meadow blade is behind it.
        depthTest={true}
        depthWrite={true}
        toneMapped={false}
      />
    </mesh>
  );
}

/** The approved live path. Mounting this component subscribes the graph and
 * horizon to the frame loop; the diagnostics-off branch instantiates neither. */
function CoordinationSingularity({
  still,
  burstSignal,
}: {
  still: boolean;
  burstSignal: BurstSignal;
}) {
  const horizonMaterial = useRef<THREE.ShaderMaterial>(null);
  const legibility = useCoordinationLegibility();
  return (
    <>
      {/* Discarded horizon fragments have no backing mesh. They reveal the
          actual meadow and scene color, making the dither part of the orb's
          silhouette rather than a pattern painted over glass. */}
      <AmorphousHorizon materialRef={horizonMaterial} legibility={legibility} />
      {/* Depth is deliberately disobeyed here: the graph is spatially inside
          the opaque horizon, yet remains readable as if the glass has exposed
          information that ordinary light cannot carry back out. */}
      <group scale={COORDINATION_NETWORK_SCALE}>
        <CoordinationNetwork
          still={still}
          burstSignal={burstSignal}
          horizonMaterial={horizonMaterial}
          legibility={legibility}
        />
      </group>
    </>
  );
}

function CoordinationGlobeBody({
  dark,
  effectEnabled,
  still,
  burstSignal,
}: {
  dark: boolean;
  effectEnabled: boolean;
  still: boolean;
  burstSignal: BurstSignal;
}) {
  return (
    <group name={aboutLandmarkNodeName("coordination-globe")}>
      <group scale={COORDINATION_PLINTH_SCALE}>
        <mesh
          castShadow
          position={[0, COORDINATION_BASE_CENTER_Y, 0]}
          raycast={NO_RAYCAST}
        >
          <cylinderGeometry
            args={[
              COORDINATION_BASE_TOP_RADIUS,
              COORDINATION_BASE_BOTTOM_RADIUS,
              COORDINATION_BASE_HEIGHT,
              6,
            ]}
          />
          <meshStandardMaterial
            color={dark ? "#010205" : "#05070a"}
            metalness={0.82}
            roughness={0.24}
          />
        </mesh>
      </group>
      <group scale={COORDINATION_NECK_SCALE}>
        <mesh
          castShadow
          position={[0, COORDINATION_STEM_CENTER_Y, 0]}
          raycast={NO_RAYCAST}
        >
          <cylinderGeometry
            args={[
              COORDINATION_STEM_TOP_RADIUS,
              COORDINATION_STEM_BOTTOM_RADIUS,
              COORDINATION_STEM_HEIGHT,
              6,
            ]}
          />
          <meshStandardMaterial
            color="#080b10"
            metalness={0.76}
            roughness={0.3}
          />
        </mesh>
      </group>
      <group position={[0, COORDINATION_CORE_CENTER_Y, 0]}>
        {effectEnabled ? (
          <CoordinationSingularity still={still} burstSignal={burstSignal} />
        ) : null}
      </group>
      <mesh
        name="interaction-hit:coordination-globe"
        position={[0, COORDINATION_CORE_CENTER_Y, 0]}
        userData={{ physicsIgnore: true }}
      >
        <sphereGeometry args={[COORDINATION_INTERACTION_RADIUS, 20, 14]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
    </group>
  );
}

export function CoordinationGlobe({
  unitIndex,
  palette,
  dark,
  base,
  scale = 1,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  base: [number, number, number];
  scale?: number;
}) {
  const diagnostics = useSyncExternalStore(
    coordinationGlobeDiagnosticsController.subscribe,
    coordinationGlobeDiagnosticsController.getSnapshot,
    coordinationGlobeDiagnosticsController.getSnapshot,
  );
  const near = useStacks(
    (state) => Math.abs(state.activeUnit - unitIndex) <= 1,
  );
  const hovered = useStacks(
    (state) => state.hovered === COORDINATION_GLOBE_INTERACTION_ID,
  );
  const focused = useStacks(
    (state) => state.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID,
  );
  const dragged = useStacks(
    (state) => state.dragging === COORDINATION_GLOBE_INTERACTION_ID,
  );
  const coordinationEngaged = focused || hovered || dragged;
  const still = useMemo(() => prefersReducedMotion(), []);
  const burstSignal = useRef(createCoordinationBurst());
  const shockwaveOrigin = useRef<THREE.Group>(null);
  const shockwaveWorld = useMemo(() => new THREE.Vector3(), []);
  const wasShockwaveEngaged = useRef(false);
  const lastShockwaveAt = useRef(Number.NEGATIVE_INFINITY);
  const effectEnabled = diagnostics.effectEnabled && near;
  const projectedLocalBounds = useMemo(() => {
    const radius = COORDINATION_INTERACTION_RADIUS * scale;
    return {
      min: [-radius, 0, -radius] as const,
      max: [
        radius,
        (COORDINATION_CORE_CENTER_Y + COORDINATION_INTERACTION_RADIUS) * scale,
        radius,
      ] as const,
    };
  }, [scale]);
  useEffect(() => {
    if (!effectEnabled) burstSignal.current = createCoordinationBurst();
  }, [effectEnabled]);
  const emitShockwave = useCallback(
    (
      origin: Readonly<{ x: number; y: number; z: number }>,
      discovered = false,
    ) => {
      if (!effectEnabled || still) return;
      if (discovered) recordFieldNoteEvent({ type: "coordination-shockwave" });
      const now = performance.now();
      if (now - lastShockwaveAt.current < 900) return;
      lastShockwaveAt.current = now;
      triggerCoordinationBurst(burstSignal.current);
      sceneAudio.play(
        "coordination-boom",
        {
          x: origin.x,
          y: origin.y + COORDINATION_CORE_CENTER_Y * scale,
          z: origin.z,
        },
        0.75,
      );
      publishSceneImpulse({
        sourceId: COORDINATION_GLOBE_INTERACTION_ID,
        x: origin.x,
        y: origin.y + COORDINATION_CORE_CENTER_Y * scale,
        z: origin.z,
        radius: 1.65,
        strength: 2,
        palette: "coordination",
      });
      publishMeadowPhysicalEvent({
        kind: "impact",
        startX: origin.x,
        startZ: origin.z,
        endX: origin.x,
        endZ: origin.z,
        y: SHELF_GEOMETRY.groundY,
        directionX: 0,
        directionZ: 0,
        strength: 2,
        radius: 1.05,
        timeScale: 1.7,
      });
    },
    [effectEnabled, scale, still],
  );
  useEffect(() => {
    const entered = coordinationEngaged && !wasShockwaveEngaged.current;
    wasShockwaveEngaged.current = coordinationEngaged;
    const origin = shockwaveOrigin.current;
    if (!entered || !origin) return;
    origin.getWorldPosition(shockwaveWorld);
    emitShockwave(
      {
        x: shockwaveWorld.x,
        y: shockwaveWorld.y,
        z: shockwaveWorld.z,
      },
      true,
    );
  }, [coordinationEngaged, emitShockwave, shockwaveWorld]);
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={COORDINATION_GLOBE_INTERACTION_ID}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={0.28 * scale}
      shape="box"
      massKg={0.85}
      restitution={0.1}
      maxThrowSpeed={2.2}
      onDragIntent={(origin) => emitShockwave(origin, true)}
      projectedLocalBounds={projectedLocalBounds}
      href="https://coordination.sh/"
      portalLabel="Coordination Research"
      external
    >
      <group ref={shockwaveOrigin} scale={scale}>
        <CoordinationGlobeBody
          dark={dark}
          effectEnabled={effectEnabled}
          still={still}
          burstSignal={burstSignal}
        />
      </group>
    </Grabbable>
  );
}
