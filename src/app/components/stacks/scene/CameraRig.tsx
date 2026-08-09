"use client";

// Drives the camera from the drei scroll offset, publishes per-frame progress
// to the transient ref, flips activeUnit only on unit-boundary crosses, and
// registers the scroll element with the store for the DOM bridges.
import { useFrame, useThree } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { UNIT_COUNT } from "../data";
import { progressRef, useStacks } from "../store";
import { cameraForAspect, TRAVEL_X } from "./worldLayout";

export default function CameraRig() {
  const scroll = useScroll();
  const look = useRef(new THREE.Vector3(0, -0.05, -0.2));
  const prevActive = useRef(0);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const pose = useMemo(
    () => cameraForAspect(size.width / size.height),
    [size.width, size.height],
  );

  // Apply distance/fov when the pose changes (mount, resize, orientation).
  useEffect(() => {
    camera.position.z = pose.z;
    if ("fov" in camera) {
      (camera as THREE.PerspectiveCamera).fov = pose.fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  }, [camera, pose]);

  useEffect(() => {
    const el = scroll.el;
    el.classList.add("stacks-scroll");
    const state = useStacks.getState();
    state.setScrollEl(el);
    // Instant jump: snap drei's damped offset (its internal target ref and the
    // eased value) plus our look target so deep-links land without a flythrough.
    const scrollTarget = (
      scroll as unknown as { scroll: { current: number } }
    ).scroll;
    const clampedOffset = (unit: number) => {
      const raw = UNIT_COUNT > 1 ? unit / (UNIT_COUNT - 1) : 0;
      return Math.min(1, Math.max(0, raw));
    };
    state.setJumpTo((unit: number) => {
      const max = el.scrollWidth - el.clientWidth;
      const offset = clampedOffset(unit);
      el.scrollLeft = offset * max;
      scrollTarget.current = offset;
      scroll.offset = offset;
      progressRef.current = offset;
      const targetX = offset * TRAVEL_X;
      look.current.set(targetX, -0.08, -0.2);
      const active = Math.min(UNIT_COUNT - 1, Math.max(0, Math.round(unit)));
      prevActive.current = active;
      useStacks.getState().setActiveUnit(active);
    });
    // Damped travel: write the damp target directly (plus scrollLeft so the
    // native element agrees) — never depends on the scroll event.
    state.setTravelTo((unit: number) => {
      const max = el.scrollWidth - el.clientWidth;
      const offset = clampedOffset(unit);
      el.scrollLeft = offset * max;
      scrollTarget.current = offset;
    });
    // Pointer cursor for hoverable scene objects — the scroll el owns events.
    const unsubscribeCursor = useStacks.subscribe((s) => {
      el.style.cursor = s.hovered ? "pointer" : "";
    });
    return () => {
      unsubscribeCursor();
      const cleanup = useStacks.getState();
      cleanup.setScrollEl(null);
      cleanup.setJumpTo(null);
      cleanup.setTravelTo(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll.el]);

  useFrame(({ camera, pointer, clock }) => {
    const offset = scroll.offset;
    progressRef.current = offset;
    const targetX = offset * TRAVEL_X;
    const t = clock.elapsedTime;
    camera.position.x = targetX;
    camera.position.y +=
      (pose.y + pointer.y * 0.08 + Math.sin(t * 0.4) * 0.03 -
        camera.position.y) *
      0.05;
    look.current.x += (targetX + pointer.x * 0.45 - look.current.x) * 0.045;
    look.current.y += (pointer.y * 0.12 - 0.08 - look.current.y) * 0.05;
    camera.lookAt(look.current);

    const active = Math.min(
      UNIT_COUNT - 1,
      Math.max(0, Math.round(offset * (UNIT_COUNT - 1))),
    );
    if (active !== prevActive.current) {
      prevActive.current = active;
      useStacks.getState().setActiveUnit(active);
    }
  });
  return null;
}
