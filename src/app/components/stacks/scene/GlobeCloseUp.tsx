"use client";

// The About globe's close-up: PropApproach bound to the globe, plus the two
// things a globe needs that a Mac did not. While the globe is up, the ball's
// own drift and hover rate stand down (a drag turns it instead, through
// globeSpin), and the pointer is raycast against the chapter marks every
// frame so the chrome layer can name the one under it. Chapter marks open
// their chapter; the green visited-country and red lived-place marks are
// labels only.
import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import PropApproach from "./PropApproach";
import {
  GLOBE_LIVED_MARKS_NAME,
  GLOBE_MARKS_NAME,
  GLOBE_VISITED_MARKS_NAME,
} from "./globeBall";
import {
  GLOBE_APPROACH_FILL,
  GLOBE_APPROACH_HEIGHT,
  GLOBE_APPROACH_WIDTH,
  globeApproach,
  globeChapterClusters,
  globeChapterHover,
  globeLivedPlaceClusters,
  globeSpin,
  globeTilt,
  globeVisitedPlaceClusters,
  resetGlobeHandLap,
} from "./globeCloseUpState";
import { usePropApproachNear } from "./propApproachState";

export default function GlobeCloseUp({
  unitIndex,
  children,
}: {
  unitIndex: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const near = usePropApproachNear(globeApproach);
  const get = useThree((state) => state.get);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const chapterMarks = useRef<THREE.InstancedMesh | null>(null);
  const visitedMarks = useRef<THREE.InstancedMesh | null>(null);
  const livedMarks = useRef<THREE.InstancedMesh | null>(null);

  useEffect(() => {
    globeSpin.setCalm(near);
    if (near) resetGlobeHandLap();
    else {
      globeTilt.current = 0;
      globeChapterHover.set(null);
    }
    return () => {
      globeSpin.setCalm(false);
      globeChapterHover.set(null);
    };
  }, [near]);

  useFrame(() => {
    const node = group.current;
    if (!near || !node) return;
    // The ball is rebuilt on a theme flip, so the cached mesh can go stale.
    let chapters = chapterMarks.current;
    if (!chapters?.parent) {
      chapters =
        (node.getObjectByName(GLOBE_MARKS_NAME) as
          | THREE.InstancedMesh
          | undefined) ?? null;
      chapterMarks.current = chapters;
    }
    let lived = livedMarks.current;
    if (!lived?.parent) {
      lived =
        (node.getObjectByName(GLOBE_LIVED_MARKS_NAME) as
          | THREE.InstancedMesh
          | undefined) ?? null;
      livedMarks.current = lived;
    }
    let visited = visitedMarks.current;
    if (!visited?.parent) {
      visited =
        (node.getObjectByName(GLOBE_VISITED_MARKS_NAME) as
          | THREE.InstancedMesh
          | undefined) ?? null;
      visitedMarks.current = visited;
    }
    if (!chapters && !visited && !lived) {
      globeChapterHover.set(null);
      return;
    }
    const { camera, pointer, gl } = get();
    raycaster.setFromCamera(pointer, camera);
    // The whole subtree, nearest first: a mark on the far side is behind
    // the ball and must not light up through it.
    const hit = raycaster.intersectObject(node, true)[0];
    if (
      (hit?.object !== chapters &&
        hit?.object !== visited &&
        hit?.object !== lived) ||
      hit.instanceId === undefined ||
      hit.instanceId === null
    ) {
      globeChapterHover.set(null);
      return;
    }
    const rect = gl.domElement.getBoundingClientRect();
    projected.copy(hit.point).project(camera);
    const position = {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
    if (hit.object === lived) {
      const place = globeLivedPlaceClusters()[hit.instanceId];
      globeChapterHover.set(
        place
          ? { kind: "lived", index: hit.instanceId, place, ...position }
          : null,
      );
      return;
    }
    if (hit.object === visited) {
      const place = globeVisitedPlaceClusters()[hit.instanceId];
      globeChapterHover.set(
        place
          ? { kind: "visited", index: hit.instanceId, place, ...position }
          : null,
      );
      return;
    }
    const cluster = globeChapterClusters()[hit.instanceId];
    if (!cluster) {
      globeChapterHover.set(null);
      return;
    }
    globeChapterHover.set({
      kind: "chapter",
      index: hit.instanceId,
      chapters: cluster.chapters,
      ...position,
    });
  });

  return (
    <PropApproach
      controller={globeApproach}
      unitIndex={unitIndex}
      height={GLOBE_APPROACH_HEIGHT}
      width={GLOBE_APPROACH_WIDTH}
      fill={GLOBE_APPROACH_FILL}
      keepPressesOnProp
      tilt={globeTilt}
      innerRef={group}
    >
      {children}
    </PropApproach>
  );
}
