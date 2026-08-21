"use client";

import { UNIT_COUNT } from "../data";
import { progressRef, useStacks } from "../store";
import { type RenderCallback, useFrame } from "@react-three/fiber";
import { type ReactNode, createContext, useContext, useEffect } from "react";
import * as THREE from "three";

import { scenePerformanceController } from "./scenePerformance";
import { unitPose } from "./worldLayout";

export type UnitActivityState = "hot" | "warm" | "cold";
export type UnitWorkLane =
  | "ambient"
  | "interactive"
  | "physics"
  | "maintenance";

export type ProjectedUnit = {
  inDepth: boolean;
  minX: number;
  maxX: number;
};

export function projectedUnitIntersects(
  projected: ProjectedUnit,
  threshold: number,
) {
  return (
    projected.inDepth &&
    projected.minX <= threshold &&
    projected.maxX >= -threshold
  );
}

export function directionalUnitLookahead(
  scenePosition: number,
  direction: -1 | 0 | 1,
  unitCount: number,
) {
  return Math.min(
    Math.max(0, unitCount - 1),
    Math.max(0, Math.round(scenePosition) + direction),
  );
}

export function resolveUnitActivityState({
  projected,
  previous,
  active,
  lookahead,
  pinned,
  enabled,
  outsideSince,
  now,
}: {
  projected: ProjectedUnit;
  previous: UnitActivityState;
  active: boolean;
  lookahead: boolean;
  pinned: boolean;
  enabled: boolean;
  outsideSince: number;
  now: number;
}): Readonly<{ state: UnitActivityState; outsideSince: number }> {
  if (!enabled || pinned) return { state: "hot", outsideSince: -1 };
  const hotThreshold = previous === "hot" ? 1.2 : 1.05;
  const warmThreshold = previous === "cold" ? 1.45 : 1.6;
  if (projectedUnitIntersects(projected, hotThreshold))
    return { state: "hot", outsideSince: -1 };
  if (active || lookahead || projectedUnitIntersects(projected, warmThreshold))
    return { state: "warm", outsideSince: -1 };
  const outsideAt = outsideSince < 0 ? now : outsideSince;
  return {
    state: now - outsideAt >= 250 ? "cold" : "warm",
    outsideSince: outsideAt,
  };
}

const LANES: readonly UnitWorkLane[] = [
  "ambient",
  "interactive",
  "physics",
  "maintenance",
];

const laneRecord = <T,>(value: T): Record<UnitWorkLane, T> => ({
  ambient: value,
  interactive: value,
  physics: value,
  maintenance: value,
});

class SceneUnitActivityController {
  private readonly states: UnitActivityState[] = Array.from(
    { length: UNIT_COUNT },
    () => "hot",
  );
  private readonly roots = new Map<number, THREE.Group>();
  private readonly projected: ProjectedUnit[] = Array.from(
    { length: UNIT_COUNT },
    () => ({ inDepth: false, minX: Infinity, maxX: -Infinity }),
  );
  private readonly samples = Array.from(
    { length: UNIT_COUNT },
    () =>
      [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const,
  );
  private readonly outsideSince = new Array<number>(UNIT_COUNT).fill(-1);
  private readonly allowed = Array.from({ length: UNIT_COUNT }, () =>
    laneRecord(true),
  );
  private readonly laneDelta = Array.from({ length: UNIT_COUNT }, () =>
    laneRecord(0),
  );
  private readonly laneElapsed = Array.from({ length: UNIT_COUNT }, () =>
    laneRecord(0),
  );
  private readonly pins = Array.from(
    { length: UNIT_COUNT },
    () => new Set<string>(),
  );
  private previousProgress = progressRef.current;
  private direction: -1 | 0 | 1 = 0;
  private executed = 0;
  private skipped = 0;

  registerRoot(index: number, root: THREE.Group) {
    this.roots.set(index, root);
    root.visible = this.states[index] !== "cold";
    return () => {
      if (this.roots.get(index) === root) this.roots.delete(index);
      root.visible = true;
    };
  }

  pin(index: number, token: string) {
    this.pins[index]?.add(token);
    return () => this.pins[index]?.delete(token);
  }

  stateFor(index: number) {
    return this.states[index] ?? "hot";
  }

  snapshot() {
    return {
      states: [...this.states],
      hot: this.states.flatMap((state, index) =>
        state === "hot" ? [index] : [],
      ),
      warm: this.states.flatMap((state, index) =>
        state === "warm" ? [index] : [],
      ),
      cold: this.states.flatMap((state, index) =>
        state === "cold" ? [index] : [],
      ),
      visible: this.projected.flatMap((projected, index) =>
        projectedUnitIntersects(projected, 1.05) ? [index] : [],
      ),
      executed: this.executed,
      skipped: this.skipped,
    } as const;
  }

  /** Temporarily expose every registered unit to an offscreen warm-up draw.
   * Exact visibility is restored before the next browser frame. */
  withAllRootsVisible(run: () => void) {
    const roots = [...this.roots.values()].map((root) => ({
      root,
      visible: root.visible,
    }));
    for (const { root } of roots) root.visible = true;
    try {
      run();
    } finally {
      for (const { root, visible } of roots) root.visible = visible;
    }
  }

  allows(index: number | null, lane: UnitWorkLane) {
    if (index === null) return true;
    const allowed = this.allowed[index]?.[lane] ?? true;
    if (allowed) this.executed += 1;
    else this.skipped += 1;
    return allowed;
  }

  deltaFor(index: number | null, lane: UnitWorkLane, rawDelta: number) {
    if (index === null) return rawDelta;
    return this.laneDelta[index]?.[lane] ?? Math.min(rawDelta, 0.05);
  }

  update(camera: THREE.Camera, rawDelta: number, now: number) {
    this.executed = 0;
    this.skipped = 0;
    const enabled = scenePerformanceController.getSnapshot().virtualizeUnitWork;
    const progress = progressRef.current;
    const progressDelta = progress - this.previousProgress;
    if (Math.abs(progressDelta) > 0.000_002)
      this.direction = progressDelta > 0 ? 1 : -1;
    this.previousProgress = progress;
    const activeUnit = useStacks.getState().activeUnit;
    const scenePosition = progress * Math.max(0, UNIT_COUNT - 1);
    const lookahead = directionalUnitLookahead(
      scenePosition,
      this.direction,
      UNIT_COUNT,
    );

    for (let index = 0; index < UNIT_COUNT; index += 1) {
      const pose = unitPose(index);
      const [center, left, right] = this.samples[index]!;
      const yaw = pose.rotation[1];
      const edgeX = Math.cos(yaw) * 1.9;
      const edgeZ = -Math.sin(yaw) * 1.9;
      center.set(pose.position[0], 0.4, pose.position[2]).project(camera);
      left
        .set(pose.position[0] - edgeX, 0.4, pose.position[2] - edgeZ)
        .project(camera);
      right
        .set(pose.position[0] + edgeX, 0.4, pose.position[2] + edgeZ)
        .project(camera);
      const projected = this.projected[index]!;
      projected.inDepth =
        (center.z >= -1 && center.z <= 1) ||
        (left.z >= -1 && left.z <= 1) ||
        (right.z >= -1 && right.z <= 1);
      projected.minX = Math.min(center.x, left.x, right.x);
      projected.maxX = Math.max(center.x, left.x, right.x);

      const resolution = resolveUnitActivityState({
        projected,
        previous: this.states[index] ?? "hot",
        active: index === activeUnit,
        lookahead: index === lookahead,
        pinned: this.pins[index]!.size > 0,
        enabled,
        outsideSince: this.outsideSince[index] ?? -1,
        now,
      });
      const next = resolution.state;
      this.outsideSince[index] = resolution.outsideSince;
      this.states[index] = next;
      const root = this.roots.get(index);
      if (root) root.visible = next !== "cold";

      for (const lane of LANES) {
        this.laneElapsed[index]![lane] += rawDelta;
        let allowed = next === "hot";
        if (next === "warm" && lane === "ambient")
          allowed = this.laneElapsed[index]![lane] >= 1 / 15;
        if (lane === "maintenance" && next !== "hot")
          allowed = this.laneElapsed[index]![lane] >= 0.25;
        this.allowed[index]![lane] = allowed;
        this.laneDelta[index]![lane] = allowed
          ? Math.min(0.05, this.laneElapsed[index]![lane])
          : 0;
        if (allowed) this.laneElapsed[index]![lane] = 0;
      }
    }
  }
}

export const sceneUnitActivityController = new SceneUnitActivityController();

const UnitActivityContext = createContext<number | null>(null);

export function UnitActivityProvider({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <UnitActivityContext.Provider value={index}>
      {children}
    </UnitActivityContext.Provider>
  );
}

export function useUnitFrame(
  callback: RenderCallback,
  lane: UnitWorkLane = "ambient",
  renderPriority = 0,
) {
  const unitIndex = useContext(UnitActivityContext);
  useFrame((state, delta, frame) => {
    if (!sceneUnitActivityController.allows(unitIndex, lane)) return;
    callback(
      state,
      sceneUnitActivityController.deltaFor(unitIndex, lane, delta),
      frame,
    );
  }, renderPriority);
}

export function SceneUnitActivityDriver() {
  useFrame((state, delta) => {
    state.camera.updateMatrixWorld();
    sceneUnitActivityController.update(
      state.camera,
      Math.min(delta, 0.05),
      performance.now(),
    );
  });
  return null;
}

export function useUnitActivityRoot(
  index: number,
  root: React.RefObject<THREE.Group | null>,
) {
  useEffect(() => {
    if (!root.current) return;
    return sceneUnitActivityController.registerRoot(index, root.current);
  }, [index, root]);
}
