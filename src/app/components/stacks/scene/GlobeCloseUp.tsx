"use client";

// The About globe's close-up: PropApproach bound to the globe, plus the two
// things a globe needs that a Mac did not. While the globe is up, the ball's
// drift slows and pauses over a mark, while a drag adds momentum through
// globeSpin. The pointer is raycast against the chapter marks every
// frame so the chrome layer can name the one under it. Chapter marks open
// their chapter; the green visited-country marks and white lived-place houses are
// labels only.
import { touchWorldRef, useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import PropApproach from "./PropApproach";
import { pickGlobeMarker } from "./globeBall";
import {
  GLOBE_APPROACH_FILL,
  GLOBE_APPROACH_HEIGHT,
  GLOBE_APPROACH_WIDTH,
  GLOBE_TILT_LAMBDA,
  cancelGlobeDrag,
  globeApproach,
  globeChapterClusters,
  globeChapterHover,
  globeLivedPlaceClusters,
  globeMarkProbe,
  globeSpin,
  globeTilt,
  globeVisitedPlaceClusters,
  resetGlobeHandLap,
} from "./globeCloseUpState";
import { usePropApproachNear } from "./propApproachState";

export default function GlobeCloseUp({
  unitIndex,
  hoverKey,
  children,
}: {
  unitIndex: number;
  /** The carrier's interaction id: the press the touch arbiter marks. */
  hoverKey: string;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const near = usePropApproachNear(globeApproach);
  const get = useThree((state) => state.get);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    globeSpin.setCalm(near);
    if (near) resetGlobeHandLap();
    else {
      globeTilt.current = 0;
      globeChapterHover.set(null);
    }
    return () => {
      cancelGlobeDrag();
      globeSpin.setCalm(false);
      globeChapterHover.set(null);
    };
  }, [near]);

  // Where to cast from. r3f's pointer only follows a fine pointer: the touch
  // arbiter claims every touch at the window before the canvas sees it, so on
  // a phone that pointer sits wherever the last mouse left it, or at the
  // screen centre, which is where the near globe is. The arbiter publishes
  // the finger's own position; cast from that instead while touch is the
  // active pointer type.
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const pointerNdc = useCallback(() => {
    const { pointer, gl } = get();
    if (touchWorldRef.interactionPointerType !== "touch") return pointer;
    const rect = gl.domElement.getBoundingClientRect();
    ndc.set(
      ((touchWorldRef.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((touchWorldRef.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    return ndc;
  }, [get, ndc]);

  const sampleMarks = useCallback(() => {
    const node = group.current;
    if (!near || !node) return;
    const { camera, gl } = get();
    raycaster.setFromCamera(pointerNdc(), camera);
    const hit = pickGlobeMarker(node, raycaster);
    if (!hit) {
      globeChapterHover.set(null);
      return;
    }
    const rect = gl.domElement.getBoundingClientRect();
    projected.copy(hit.point).project(camera);
    const position = {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
    if (hit.kind === "lived") {
      const place = globeLivedPlaceClusters()[hit.index];
      globeChapterHover.set(
        place ? { kind: "lived", index: hit.index, place, ...position } : null,
      );
      return;
    }
    if (hit.kind === "visited") {
      const place = globeVisitedPlaceClusters()[hit.index];
      globeChapterHover.set(
        place
          ? { kind: "visited", index: hit.index, place, ...position }
          : null,
      );
      return;
    }
    const cluster = globeChapterClusters()[hit.index];
    if (!cluster) {
      globeChapterHover.set(null);
      return;
    }
    globeChapterHover.set({
      kind: "chapter",
      index: hit.index,
      chapters: cluster.chapters,
      ...position,
    });
  }, [get, near, pointerNdc, projected, raycaster]);

  // A fine pointer is sampled every frame, so the hover follows the cursor.
  // A finger is sampled once, the moment its press lands (below). The
  // camera's touch parallax starts moving the instant a finger is down, so
  // by the time it lifts the mark it touched is no longer under it; a
  // per-frame sample read that miss and the tap dismissed the globe. The
  // press-time mark stays the hover until the next press, a drag, or the
  // globe going back, which is also the right label model for a screen
  // with no hover: the mark you touched stays named.
  useFrame(() => {
    if (touchWorldRef.interactionPointerType !== "touch") sampleMarks();
    globeSpin.state.paused = near && globeChapterHover.current !== null;
  });

  useEffect(() => {
    if (!near) return;
    globeMarkProbe.current = sampleMarks;
    // The touch arbiter marks the press before any frame runs, and the
    // finger's pixels are already published, so this cast sees the scene
    // exactly as the finger did.
    const unsubscribe = useStacks.subscribe((state, previous) => {
      if (
        state.pressedInteraction === hoverKey &&
        previous.pressedInteraction !== hoverKey &&
        touchWorldRef.interactionPointerType === "touch"
      )
        sampleMarks();
    });
    return () => {
      unsubscribe();
      if (globeMarkProbe.current === sampleMarks) globeMarkProbe.current = null;
    };
  }, [hoverKey, near, sampleMarks]);

  return (
    <PropApproach
      controller={globeApproach}
      unitIndex={unitIndex}
      height={GLOBE_APPROACH_HEIGHT}
      width={GLOBE_APPROACH_WIDTH}
      fill={GLOBE_APPROACH_FILL}
      keepPressesOnProp
      tilt={globeTilt}
      tiltLambda={GLOBE_TILT_LAMBDA}
      innerRef={group}
    >
      {children}
    </PropApproach>
  );
}
