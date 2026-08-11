"use client";

// The library — packed spine rows on both shelves with the owner's FEATURED
// books standing cover-out in front of them and bookends holding the loose
// row ends. The featured covers open their own notes; every other book on the
// unit — spine, flat stack, leaner, pile — opens the
// library itself (`linkUnit`).
//
// The unit's left flank is deliberately EMPTY FLOOR. It held a step ladder,
// which the owner has now killed outright ("let's just get rid of the
// ladder"), and the composition is solved without one rather than around a
// hole: the shelves carry the weight, and the run of bare floor under the
// case's left end is the only place in the room where you can see the whole
// of a bookcase's silhouette. If a replacement lands later it goes at
// x ≈ −2.2 on the ground, which is the slot the ladder vacated.
import { GRAB_HOVER, useStacks } from "../../store";
import { type Palette, rand } from "../../theme";
import {
  type BookInteraction,
  type BookInteractionInput,
  buildBookInteractions,
  permitsSecretProjectedFallback,
  pickSecretSpineIndex,
  setBookInteractionInventory,
  setBookInteractionScreens,
} from "../bookInteractions";
import {
  allowsBookSecretProjectedRecovery,
  beginBookSecretPull,
  bookSecretRef,
  bookSecretRenderScore,
  closeBookSecret,
  commitsBookSecretReturnTap,
  releaseBookSecretPull,
  requestBookSecretHint,
  resetBookSecret,
  setBookSecretPull,
  setBookSecretReducedMotion,
  subscribeBookSecret,
} from "../bookSecret";
import { HoverProp } from "../links";
import {
  BookRowMesh,
  Bookend,
  type RowItem,
  ShelfUnit,
  coverExtent,
  packRow,
} from "../primitives";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { useUnitLod } from "../useUnitLod";
import { RoundedBox } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import { type UnitProps } from "./types";

// The hidden room has substantially more authored geometry than the shelf it
// replaces. Keep it out of the initial route, then warm the tiny room chunk as
// soon as Books owns the camera. Waiting until the latch releases left a blank
// aperture on a cold/dev cache while the case was already swinging; unit-level
// priming preserves lazy startup without making network timing part of the
// reveal choreography.
const loadSecretReadingRoom = () => import("../SecretReadingRoom");
const SecretReadingRoom = React.lazy(loadSecretReadingRoom);

/**
 * THE FRONT RANK'S GEOMETRY. Everything here is an EDGE, never a centre.
 *
 * A featured book no longer has one width: it carries its own scale, and a
 * leaning one is wider than an upright one. So the packer below works from
 * real half-extents (`coverExtent`) and only the two outer edges of a row are
 * pinned to these.
 *
 * RIGHT is +0.35. The plank runs to ±1.60, but the desktop placard covers
 * everything past +0.467 on a 1280 × 900 window — its left edge is
 * (viewportWidth/2 − 528) over the 239.6 px per unit this camera holds on an
 * odd unit — and +0.35 keeps a centimetre of margin on the narrowest window
 * that still gets a placard. Anything right of that is invisible on a laptop.
 *
 * LEFT is −1.46, and it is the PHONE that sets it, not the plank. Desktop can
 * read to −1.55, but the 390-wide camera frames this unit at 128.4 px per
 * world unit with x = 0 at screen 185, so its left edge is world −1.44 and
 * anything beyond that is off the side of the phone. −1.46 puts the leftmost
 * cover's edge inside the old layout's own −1.48, so no featured book is worse
 * off on a phone than it was.
 *
 * The LOWER row starts further in again: the golden-hour print leans at x −1.5
 * and reaches −1.412, it stands at z 0.24 which is IN FRONT of the covers, and
 * a print across the corner of a featured book is the one occlusion this rank
 * cannot afford.
 */
const EDGE_R = 0.35;
const EDGE_L_TOP = -1.24;
const EDGE_L_LOWER = -1.14;

/** How many covers a shelf will take before the packer has to start
 * compressing. Five 0.36-wide books touching span 1.72 of the 1.90 available,
 * which leaves just enough for one real gap; a sixth can only be fitted by
 * overlapping them, so the split below sends it to the other shelf instead. */
const SHELF_CAP = 5;
/** Share of the ticked books the TOP shelf takes. Deliberately NOT a half.
 * An even split is the one arrangement that guarantees a reader can pair each
 * book on one shelf with the book above it, which is what makes a shelf read
 * as a grid however prettily each row is spaced. At the eight currently
 * ticked this is 5 and 3. */
const TOP_SHARE = 0.6;
const SECRET_HOVER = `${GRAB_HOVER}books:secret-spine`;
const SECRET_SHELF_HOVER = "secret:books:shelf-clue";
const SECRET_RETURN_HOVER = "secret:books:return";
const SECRET_PULL_PX = 92;
const SECRET_LATCH = 0.7;
// Measured against the rendered spine at the narrow desktop breakpoint. The
// old 36×140px window reached well into both neighbouring covers; 20×64px is
// still forgiving around the visible spine without becoming a second prop's
// hit area.
const SECRET_HIT_HALF_WIDTH = 10;
const SECRET_HIT_HALF_HEIGHT = 32;
// Matches the visible dark medallion, not just its inner brass ring. The
// projected centre can still move while the camera finishes its arrival, so
// a tap anywhere on the visible disc must claim the same return control.
const SECRET_RETURN_HIT_PX = 48;
// Front edge sits level with the face-out rank, making the narrow spine
// aimable without looking mysteriously half-pulled before the gesture begins.
const SECRET_REST_Z = 0.105;
const SECRET_DOOR_HINGE_X = -SHELF_GEOMETRY.width / 2 - 0.04;
const SECRET_DOOR_CENTER_X = -SECRET_DOOR_HINGE_X;
const NO_RAYCAST: THREE.Object3D["raycast"] = () => undefined;

type SecretFadeBaseline = {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

/** Fade the real authored surfaces rather than putting a full-bay colour
 * plane in front of them. Baselines live on each material so zero-opacity hit
 * proxies and already-transparent cover materials restore exactly. */
function setSecretSurfaceOpacity(root: THREE.Object3D | null, raw: number) {
  if (!root) return;
  const opacity = THREE.MathUtils.clamp(raw, 0, 1);
  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
    };
    if (!renderable.material) return;
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of materials) {
      let baseline = material.userData.stacksSecretFade as
        | SecretFadeBaseline
        | undefined;
      if (!baseline) {
        baseline = {
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        };
        material.userData.stacksSecretFade = baseline;
      }
      const transparent = baseline.transparent || opacity < 0.999;
      const depthWrite = opacity >= 0.999 ? baseline.depthWrite : false;
      if (
        material.transparent !== transparent ||
        material.depthWrite !== depthWrite
      ) {
        material.transparent = transparent;
        material.depthWrite = depthWrite;
        material.needsUpdate = true;
      }
      material.opacity = baseline.opacity * opacity;
    }
  });
}

const smoothstep = (value: number) => {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Canvas-only targets need measured screen centres for real pointer QA.
 * Box centres (rather than object origins) work for hinged spines, whose
 * named pivot intentionally lives at the bottom-front contact edge. */
function BookInteractionProbe({
  index,
  root,
  inventory,
}: {
  index: number;
  root: React.RefObject<THREE.Group | null>;
  inventory: BookInteraction[];
}) {
  const box = useMemo(() => new THREE.Box3(), []);
  const center = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, gl }) => {
    if (
      process.env.NODE_ENV === "production" ||
      useStacks.getState().activeUnit !== index ||
      !root.current
    )
      return;
    const rect = gl.domElement.getBoundingClientRect();
    const screens: Record<string, [number, number]> = {};
    for (const item of inventory) {
      const node = root.current.getObjectByName(item.nodeName);
      if (!node) continue;
      box.setFromObject(node, true);
      if (box.isEmpty()) continue;
      box.getCenter(center).project(camera);
      screens[item.id] = [
        rect.left + (center.x * 0.5 + 0.5) * rect.width,
        rect.top + (-center.y * 0.5 + 0.5) * rect.height,
      ];
    }
    setBookInteractionScreens(screens);
  });
  return null;
}

/** Projected R3F fallback is allowed only over this world's own input
 * surfaces. Window capture also sees the DOM sheet and every unrelated page
 * control; a screen-space rectangle alone must never claim those events. */
export function isSecretProjectionSurface(
  target: EventTarget | null,
  scrollEl: HTMLDivElement | null,
) {
  const node = target as Node | null;
  if (!scrollEl || !node || typeof node.nodeType !== "number") return false;
  if (scrollEl.contains(node)) return true;
  const canvas = scrollEl.parentElement?.querySelector("canvas");
  return node === canvas;
}

export function isSecretProjectedHit(
  event: Pick<PointerEvent, "clientX" | "clientY" | "target">,
  scrollEl: HTMLDivElement | null,
  screen: [number, number] | null,
) {
  if (!screen || !isSecretProjectionSurface(event.target, scrollEl))
    return false;
  return (
    Math.abs(event.clientX - screen[0]) <= SECRET_HIT_HALF_WIDTH &&
    Math.abs(event.clientY - screen[1]) <= SECRET_HIT_HALF_HEIGHT
  );
}

/** Empty wood on the case is the discoverability surface, never the trigger.
 * Hovering or tapping it tips the odd spine forward; the visitor must still
 * find that spine and deliberately pull it past the physical latch. */
function SecretShelfAffordance({ index }: { index: number }) {
  const setHovered = useStacks((state) => state.setHovered);
  const eligible = () => {
    const state = useStacks.getState();
    return (
      state.activeUnit === index &&
      !state.modalOpen &&
      state.panelState === "closed" &&
      !state.dragging &&
      (!state.hovered || state.hovered === SECRET_SHELF_HOVER) &&
      bookSecretRef.phase === "closed"
    );
  };

  return (
    <mesh
      name="stacks-secret-shelf-affordance"
      // Behind every cover/plant hit, but across the bookcase's empty wood.
      // Foreground Grabbables stop propagation, so their hover/drag ownership
      // wins before this recovery surface ever sees the pointer.
      position={[0, -0.2, -0.2]}
      onPointerOver={(event) => {
        if (!eligible()) return;
        event.stopPropagation();
        setHovered(SECRET_SHELF_HOVER);
        requestBookSecretHint();
      }}
      onPointerOut={() => {
        if (useStacks.getState().hovered === SECRET_SHELF_HOVER)
          setHovered(null);
      }}
      onClick={(event) => {
        if ((event.delta ?? 0) > 6 || !eligible()) return;
        event.stopPropagation();
        requestBookSecretHint();
      }}
    >
      <planeGeometry args={[3.08, 2.22]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** The one book that is more handle than hyperlink. A downward pull maps to
 * local +Z — physically out of the shelf and toward the camera — instead of
 * borrowing the generic free-carry gesture, which cannot distinguish pulling
 * a latch from simply moving a book elsewhere. Pushing the open book upward
 * reverses it; the brass handle inside the passage is the clearer return path. */
function SecretPullBook({
  index,
  palette,
  x,
  height,
  width,
  depth,
}: {
  index: number;
  palette: Palette;
  x: number;
  height: number;
  width: number;
  depth: number;
}) {
  const group = useRef<THREE.Group>(null);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const setHovered = useStacks((state) => state.setHovered);
  const pointer = useRef<number | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    direction: "open" | "close";
  } | null>(null);
  const scrollStyle = useRef<{
    el: HTMLDivElement;
    overflowX: string;
    touchAction: string;
  } | null>(null);

  useEffect(
    () => () => {
      bookSecretRef.screen = null;
    },
    [],
  );

  const restoreGestureScroll = useCallback(() => {
    const saved = scrollStyle.current;
    if (saved) {
      saved.el.style.overflowX = saved.overflowX;
      saved.el.style.touchAction = saved.touchAction;
      scrollStyle.current = null;
    }
  }, []);

  const hitsProjectedBook = useCallback((event: PointerEvent) => {
    const scrollEl = useStacks.getState().scrollEl;
    const screen = bookSecretRef.screen;
    // This fallback survives ScrollControls' event reconnection window, where
    // the visible R3F hit can briefly miss, but stays inside the measured
    // spine instead of overlapping adjacent draggable covers.
    return isSecretProjectedHit(event, scrollEl, screen);
  }, []);

  const start = useCallback(
    (event: PointerEvent) => {
      if (pointer.current !== null || !event.isPrimary || event.button !== 0)
        return;
      const store = useStacks.getState();
      if (
        store.activeUnit !== index ||
        store.modalOpen ||
        store.panelState !== "closed" ||
        store.dragging
      )
        return;
      // The shelf spine is the entrance, not an invisible remote control once
      // the hinged case is parked beside the viewer. The room's brass handle
      // is the explicit return path; disabling close here prevents a phantom
      // projected hit from floating over a neighbouring bay.
      const direction = bookSecretRef.phase === "closed" ? "open" : null;
      if (!direction || !beginBookSecretPull(direction)) return;
      pointer.current = event.pointerId;
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        direction,
      };
      store.setDragging(SECRET_HOVER);
      const el = store.scrollEl;
      if (el) {
        scrollStyle.current = {
          el,
          overflowX: el.style.overflowX,
          touchAction: el.style.touchAction,
        };
        el.style.overflowX = "hidden";
        el.style.touchAction = "none";
      }
    },
    [index],
  );

  const finish = useCallback(() => {
    if (pointer.current === null) return;
    const commit = bookSecretRef.pull >= SECRET_LATCH;
    pointer.current = null;
    gesture.current = null;
    useStacks.getState().setDragging(null);
    restoreGestureScroll();
    releaseBookSecretPull(commit);
  }, [restoreGestureScroll]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const hovered = useStacks.getState().hovered;
      // A real R3F hover owns the hit. Projected recovery is only for the
      // brief no-owner gap — it may not override an adjacent Grabbable.
      if (hovered === SECRET_HOVER) {
        start(event);
        return;
      }
      if (!permitsSecretProjectedFallback(event.pointerType)) return;
      if (
        !allowsBookSecretProjectedRecovery(hovered, SECRET_SHELF_HOVER) ||
        !hitsProjectedBook(event)
      )
        return;
      // This listener runs in capture phase. Starting immediately would beat
      // Grabbable's touch raycast in bubble phase and let the projected spine
      // steal a neighbouring cover. Defer one microtask: a real cover/prop
      // claims `dragging` first; the recovery starts only if nobody did.
      queueMicrotask(() => {
        const store = useStacks.getState();
        if (
          store.dragging ||
          !allowsBookSecretProjectedRecovery(store.hovered, SECRET_SHELF_HOVER)
        )
          return;
        start(event);
      });
    };
    const onMove = (event: PointerEvent) => {
      if (pointer.current === null) {
        const store = useStacks.getState();
        const eligible =
          store.activeUnit === index &&
          !store.modalOpen &&
          store.panelState === "closed" &&
          bookSecretRef.phase === "closed";
        if (
          eligible &&
          hitsProjectedBook(event) &&
          (store.hovered === SECRET_HOVER ||
            allowsBookSecretProjectedRecovery(
              store.hovered,
              SECRET_SHELF_HOVER,
            ))
        ) {
          store.setHovered(SECRET_HOVER);
        } else if (store.hovered === SECRET_HOVER) {
          store.setHovered(null);
        }
        return;
      }
      if (event.pointerId !== pointer.current) return;
      const active = gesture.current;
      if (!active) return;
      const dy = event.clientY - active.y;
      const dx = Math.abs(event.clientX - active.x);
      const directional = active.direction === "open" ? dy : -dy;
      // Sideways travel is not a secret pull. Penalising it makes an ordinary
      // horizontal room-pan fail safely even if it began over this spine.
      setBookSecretPull((directional - dx * 0.3) / SECRET_PULL_PX);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === pointer.current) finish();
    };
    const onWheel = (event: WheelEvent) => {
      if (pointer.current === null) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", finish);
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", finish);
      window.removeEventListener("wheel", onWheel, { capture: true });
      restoreGestureScroll();
    };
  }, [finish, hitsProjectedBook, index, restoreGestureScroll, start]);

  useFrame(({ camera, clock, size }, rawDelta) => {
    const node = group.current;
    if (!node) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const phase = bookSecretRef.phase;
    const amount =
      phase === "pulling-open" ? bookSecretRef.pull : bookSecretRef.progress;
    const pulled = smoothstep(amount);
    const hint = bookSecretRef.reducedMotion
      ? 0
      : Math.sin(bookSecretRef.hintProgress * Math.PI);
    node.position.z = THREE.MathUtils.damp(
      node.position.z,
      SECRET_REST_Z + pulled * 0.38 + hint * 0.11,
      13,
      dt,
    );
    node.rotation.x = THREE.MathUtils.damp(
      node.rotation.x,
      -pulled * 0.1,
      11,
      dt,
    );
    node.rotation.y = THREE.MathUtils.damp(
      node.rotation.y,
      hint * 0.07,
      11,
      dt,
    );
    // A hair of gilded shimmer makes the odd spine discoverable only when
    // someone is already looking at it; it never glows like a UI control.
    const mark = node.getObjectByName("stacks-secret-gilt") as THREE.Mesh;
    const material = mark?.material as THREE.MeshStandardMaterial | undefined;
    if (material) {
      const hovered = useStacks.getState().hovered;
      const direct = hovered === SECRET_HOVER;
      const clue =
        hovered === SECRET_SHELF_HOVER || bookSecretRef.hintProgress > 0;
      material.emissiveIntensity = direct
        ? 0.42 + Math.sin(clock.elapsedTime * 2.4) * 0.12
        : clue
          ? bookSecretRef.reducedMotion
            ? 0.34
            : 0.26 + Math.sin(clock.elapsedTime * 2.1) * 0.08
          : 0.08;
    }
    if (bookSecretRef.phase === "closed") {
      node.getWorldPosition(projected).project(camera);
      bookSecretRef.screen = [
        (projected.x * 0.5 + 0.5) * size.width,
        (-projected.y * 0.5 + 0.5) * size.height,
      ];
    } else {
      bookSecretRef.screen = null;
    }
  });

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    start(event.nativeEvent);
  };

  return (
    <group
      ref={group}
      name="stacks-secret-book"
      position={[x, height / 2, SECRET_REST_Z]}
      onPointerOver={(event) => {
        if (useStacks.getState().activeUnit !== index) return;
        event.stopPropagation();
        setHovered(SECRET_HOVER);
      }}
      onPointerOut={() => {
        if (useStacks.getState().hovered === SECRET_HOVER) setHovered(null);
      }}
      onPointerDown={onPointerDown}
    >
      <RoundedBox args={[width, height, depth]} radius={0.01} smoothness={4}>
        <meshStandardMaterial
          color={palette.skyTop === "#1e2842" ? "#27423b" : "#35584e"}
          roughness={0.58}
        />
      </RoundedBox>
      <mesh name="stacks-secret-gilt" position={[0, 0.02, depth / 2 + 0.002]}>
        <planeGeometry args={[Math.max(0.018, width * 0.22), height * 0.68]} />
        <meshStandardMaterial
          color="#c7a76b"
          emissive="#b9883e"
          emissiveIntensity={0.08}
          roughness={0.34}
          metalness={0.72}
        />
      </mesh>
      {/* Generous but invisible aim area; pulling still requires 64+ px of
          directional movement. It stays within the measured 20px projected
          recovery window so it cannot overlap a face-out cover beside it. */}
      <mesh position={[0, 0, depth / 2 + 0.012]}>
        <planeGeometry args={[Math.max(0.084, width * 1.12), height * 1.02]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function SecretReturnHandle() {
  const group = useRef<THREE.Group>(null);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const setHovered = useStacks((state) => state.setHovered);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const hit = (event: PointerEvent) => {
      const screen = bookSecretRef.returnScreen;
      return (
        !!screen &&
        Math.hypot(event.clientX - screen[0], event.clientY - screen[1]) <=
          SECRET_RETURN_HIT_PX
      );
    };
    const onDown = (event: PointerEvent) => {
      if (
        bookSecretRef.phase === "open" &&
        bookSecretRef.visualProgress > 0.98 &&
        (useStacks.getState().hovered === SECRET_RETURN_HOVER || hit(event))
      )
        pressed.current = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (pressed.current) return;
      const store = useStacks.getState();
      if (
        bookSecretRef.phase === "open" &&
        bookSecretRef.visualProgress > 0.98 &&
        hit(event) &&
        (!store.hovered || store.hovered === SECRET_RETURN_HOVER)
      )
        store.setHovered(SECRET_RETURN_HOVER);
      else if (store.hovered === SECRET_RETURN_HOVER) store.setHovered(null);
    };
    const onUp = (event: PointerEvent) => {
      const start = pressed.current;
      pressed.current = null;
      if (
        commitsBookSecretReturnTap(start, {
          x: event.clientX,
          y: event.clientY,
        })
      )
        closeBookSecret();
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(
    () => () => {
      bookSecretRef.returnScreen = null;
    },
    [],
  );

  useFrame(({ camera, size }) => {
    const node = group.current;
    if (
      !node ||
      bookSecretRef.phase !== "open" ||
      bookSecretRef.visualProgress <= 0.98
    ) {
      bookSecretRef.returnScreen = null;
      return;
    }
    node.getWorldPosition(projected).project(camera);
    bookSecretRef.returnScreen = [
      (projected.x * 0.5 + 0.5) * size.width,
      (-projected.y * 0.5 + 0.5) * size.height,
    ];
  });

  return (
    <group
      ref={group}
      name="stacks-secret-return"
      position={[0, -0.16, 0.15]}
      onPointerOver={(event) => {
        if (
          bookSecretRef.phase !== "open" ||
          bookSecretRef.visualProgress <= 0.98
        )
          return;
        event.stopPropagation();
        setHovered(SECRET_RETURN_HOVER);
      }}
      onPointerOut={() => {
        if (useStacks.getState().hovered === SECRET_RETURN_HOVER)
          setHovered(null);
      }}
      onClick={(event) => {
        if (
          (event.delta ?? 0) > 6 ||
          bookSecretRef.phase !== "open" ||
          bookSecretRef.visualProgress <= 0.98
        )
          return;
        event.stopPropagation();
        closeBookSecret();
      }}
    >
      <mesh>
        <torusGeometry args={[0.115, 0.022, 10, 28]} />
        <meshStandardMaterial
          color="#d8b46f"
          metalness={0.82}
          roughness={0.25}
          emissive="#9b6b28"
          emissiveIntensity={0.18}
        />
      </mesh>
      <mesh position={[0, 0, -0.012]}>
        <circleGeometry args={[0.07, 24]} />
        <meshStandardMaterial color="#33251b" roughness={0.76} />
      </mesh>
      {/* A physical inlay, not a UI glyph: the left arrow makes the only
          return control readable even before its hover treatment wakes. */}
      <mesh position={[0.012, 0, 0.018]}>
        <planeGeometry args={[0.075, 0.012]} />
        <meshStandardMaterial
          color="#d8b46f"
          metalness={0.82}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[-0.022, 0.021, 0.019]} rotation={[0, 0, 0.68]}>
        <planeGeometry args={[0.052, 0.012]} />
        <meshStandardMaterial
          color="#d8b46f"
          metalness={0.82}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[-0.022, -0.021, 0.019]} rotation={[0, 0, -0.68]}>
        <planeGeometry args={[0.052, 0.012]} />
        <meshStandardMaterial
          color="#d8b46f"
          metalness={0.82}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0, 0.026]}>
        <ringGeometry args={[0.115, 0.19, 28]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * ONE SHELF'S WORTH OF FEATURED BOOKS, arranged the way a person leaves them.
 *
 * The old version of this was four covers at a fixed 0.44 pitch, identical
 * size, identical angle, identical depth, on each of two shelves — which is a
 * 2 × 4 product grid with a plank drawn behind it, and the owner said so.
 * Nothing here rolls a die at render time: every number is `rand(i, salt)`,
 * theme's pure hash of the slot and the shelf, so a book's pose is the same on
 * every frame. Math.random would re-pose the shelf on each re-render and make
 * a hovered cover flicker between two arrangements.
 *
 * The pose is keyed to the SLOT rather than to the book's id on purpose. The
 * arrangement is a composition that has to fit a fixed length of plank — the
 * gaps, the leans and the overlaps are all sized against their neighbours — so
 * when a tick is added or removed the whole row has to recompose anyway. A
 * per-id pose would survive the change and then be wrong for its new
 * neighbour: a book leaning on somebody who is no longer there.
 *
 * Four kinds of joint between adjacent books, and the pitch of each is derived
 * from the two books it joins rather than typed in:
 *   front — the right-hand book steps 0.085 toward the viewer and overlaps its
 *           neighbour by 0.02. A book standing part in front of another is the
 *           most unmistakably un-gridded thing a shelf can do, and it buys
 *           back a little of the width a row of five needs.
 *           The overlap is SMALL because the camera is off to the left of this
 *           unit, so a book 0.085 nearer the lens covers more of its neighbour
 *           on screen than its footprint says — measured at 0.09 of overlap it
 *           took a third of the cover behind it, and this rank is the owner's
 *           curated list. None of it may be lost to composition.
 *   lean  — one of the pair tips onto the other at 0.11…0.18 rad. The pitch is
 *           the exact tangency, extent + extent: any less and the leaner's top
 *           corner passes THROUGH the book it is leaning on, which is the kind
 *           of overlap a screenshot cannot show you because interpenetration
 *           and layering look identical from one camera.
 *   tight — 2 cm of air. Two books that were shelved together.
 *   gap   — 12…26 cm of nothing, with the packed spine row showing through it.
 *           This is also the row's slack absorber: when the ticks outgrow the
 *           plank the gaps close first and the clusters survive.
 *
 * WHICH joint goes where is rolled; HOW MANY of each there are is not. A row
 * drawing all four from a threshold on `rand` produced, at the eight currently
 * ticked, a top row of one lean and three near-identical pitches — which is
 * the grid again, arrived at honestly. So the mix is built as a bag sized off
 * the count (every row of three or more gets a real gap and a leaning pair,
 * every row of four or more an overlap) and the bag is dealt out in an order
 * `rand` decides.
 */
type Pose = {
  s: number;
  yaw: number;
  lean: number;
  riser: number;
  dz: number;
  ext: number;
};
type Joint = "front" | "lean" | "tight" | "gap";

function layoutFeatured(
  slice: { url: string; key: string }[],
  salt: number,
  edgeL: number,
): RowItem[] {
  const n = slice.length;
  if (n === 0) return [];

  // Pass 1 — the per-book pose that owes nothing to its neighbours. The scale
  // band bottoms out at 0.80 — a 0.29 × 0.42 book — which is still better than
  // twice the width of the fattest spine behind it, and that ratio is what
  // makes a featured book legible as the wide mass on the shelf.
  //
  // `dz` never goes negative and that is a measurement, not a taste call: a
  // packed spine is 0.26…0.34 deep with its BACK squared to the shelf, so the
  // deepest fronts in the row behind reach z 0.19, against a cover's own front
  // at 0.177 + dz. A cover set even slightly back from its neighbours ends up
  // BEHIND a fat spine, and a featured book with a paperback standing in front
  // of its corner is worse than no depth variation at all.
  const pose: Pose[] = slice.map((_, i) => ({
    s: 0.8 + rand(i, salt) * 0.2,
    yaw: (rand(i, salt + 1) - 0.5) * 0.22,
    lean: 0,
    riser: 0,
    dz: 0.03 + rand(i, salt + 4) * 0.05,
    ext: 0,
  }));

  // Pass 2 — the joints, and the pose changes that only make sense as a pair.
  const nj = n - 1;
  const fronts = n >= 4 ? 1 + (n >= 7 ? 1 : 0) : 0;
  const leans = n >= 2 ? 1 + (n >= 6 ? 1 : 0) : 0;
  const gaps =
    n >= 3 ? Math.max(1, Math.round((nj - fronts - leans) * 0.55)) : 0;
  const bag: Joint[] = [
    ...(Array(fronts).fill("front") as Joint[]),
    ...(Array(leans).fill("lean") as Joint[]),
    ...(Array(gaps).fill("gap") as Joint[]),
    ...(Array(Math.max(0, nj - fronts - leans - gaps)).fill(
      "tight",
    ) as Joint[]),
  ];
  const joint: Joint[] = [];
  Array.from({ length: nj }, (_, k) => k + 1)
    .sort((a, b) => rand(a, salt + 2) - rand(b, salt + 2))
    .forEach((i, k) => {
      joint[i] = bag[k]!;
    });

  for (let i = 1; i < n; i++) {
    if (joint[i] === "front") {
      pose[i]!.dz += 0.085;
    } else if (joint[i] === "lean") {
      const theta = 0.11 + rand(i, salt + 6) * 0.07;
      // A book only leans where there is something to lean ON, so which of the
      // pair tips is decided here, with the joint, and never by the book on its
      // own. Either the right one tips left onto its neighbour or the left one
      // tips right onto its — both are the same tangency, so both cost the same
      // pitch. A book already leaning, or one that has stepped forward out of
      // reach, keeps what it has: a double lean is a domino, not a shelf.
      if (rand(i, salt + 5) > 0.5 || pose[i - 1]!.lean !== 0) {
        pose[i]!.lean = theta;
      } else if (joint[i - 1] !== "front") {
        pose[i - 1]!.lean = -theta;
      } else {
        pose[i]!.lean = theta;
      }
      // Leaners share a depth with what they are leaning on. Two books at
      // different z cannot touch, and a lean into thin air reads as falling.
      pose[i]!.dz = pose[i - 1]!.dz;
    }
  }

  // Pass 3 — risers. A cover propped on a flat book breaks the one line every
  // face-out row otherwise draws: eight bases at exactly two heights. Only an
  // upright book gets one; a leaning book on a riser needs the riser tilted
  // too, and that is a prop, not a knob.
  for (let i = 0; i < n; i++) {
    if (pose[i]!.lean === 0 && rand(i, salt + 3) > 0.78) pose[i]!.riser = 0.05;
  }
  for (let i = 0; i < n; i++) {
    pose[i]!.ext = coverExtent(pose[i]!.s, pose[i]!.lean);
  }

  // Pass 4 — pitches, then fit. `snug` is the pitch at which the pair touches;
  // every joint is quoted as a departure from it so the arithmetic is the same
  // whatever the two books happen to be.
  const snug = (i: number) => pose[i - 1]!.ext + pose[i]!.ext;
  const pitch: number[] = [];
  for (let i = 1; i < n; i++) {
    pitch[i] =
      joint[i] === "front"
        ? snug(i) - 0.02
        : joint[i] === "lean"
          ? snug(i) + 0.004
          : joint[i] === "tight"
            ? snug(i) + 0.02
            : snug(i) + 0.12 + rand(i, salt + 7) * 0.14;
  }

  const available = EDGE_R - edgeL;
  const total = () =>
    pose[0]!.ext + pose[n - 1]!.ext + pitch.reduce((a, b) => a + (b ?? 0), 0);

  // Overflow, in the order that costs the composition least: close the gaps
  // first, and only then squeeze everything. A ninth and tenth tick land in
  // the gaps; an eleventh starts pushing books together. Nothing here can drop
  // a book — the list is the owner's checkbox and every tick has to appear.
  let span = total();
  if (span > available) {
    const slack = pitch.reduce(
      (a, p, i) => a + (joint[i] === "gap" ? p - snug(i) - 0.02 : 0),
      0,
    );
    const k = slack > 0 ? Math.max(0, 1 - (span - available) / slack) : 0;
    for (let i = 1; i < n; i++) {
      if (joint[i] === "gap") {
        pitch[i] = snug(i) + 0.02 + (pitch[i]! - snug(i) - 0.02) * k;
      }
    }
    span = total();
  }
  if (span > available) {
    const room = available - pose[0]!.ext - pose[n - 1]!.ext;
    const sum = pitch.reduce((a, b) => a + (b ?? 0), 0);
    const k = sum > 0 ? Math.max(0.45, room / sum) : 1;
    for (let i = 1; i < n; i++) pitch[i] = pitch[i]! * k;
    span = total();
  }

  // Use most of the remaining plank as irregular breathing room. This matters
  // most for the three-book lower rank: leaving all of its spare at the right
  // made the eight featured covers look like a dense 5-up row over a small
  // 3-up grid. Weighted joints preserve clusters while letting both ranks use
  // the width of the narrower v8 shelves.
  let spare = Math.max(0, available - span);
  if (n > 1 && spare > 0) {
    const spread = spare * 0.78;
    const weights = Array.from(
      { length: n - 1 },
      (_, i) => 0.65 + rand(i + 1, salt + 9) * 0.7,
    );
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 1; i < n; i++) {
      pitch[i] = pitch[i]! + spread * (weights[i - 1]! / weightTotal);
    }
    span += spread;
    spare = Math.max(0, available - span);
  }

  // Split the small remainder asymmetrically so the two rows never share the
  // same starting vertical.
  let x = edgeL + pose[0]!.ext + spare * (0.25 + rand(0, salt + 8) * 0.35);
  return slice.map((cover, i) => {
    if (i > 0) x += pitch[i]!;
    const p = pose[i]!;
    return {
      kind: "cover" as const,
      x,
      url: cover.url,
      key: cover.key,
      s: p.s,
      yaw: p.yaw,
      lean: p.lean,
      dz: p.dz,
      riser: p.riser,
    };
  });
}

/** Bookend hit proxy. The L-steel's vertical plate is 0.012 wide — three
 * pixels from the camera — so hovering it is luck, not aim. A zero-opacity
 * box gives it a 17-pixel target, the same trick the golf ball uses. Kept
 * narrow on purpose: the packed row starts a few centimetres away and a
 * generous proxy would claim the first spine's slot instead. */
function BookendTarget() {
  return (
    <mesh position={[0, 0.11, 0]}>
      <boxGeometry args={[0.07, 0.23, 0.16]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export default function UnitBooks({
  data,
  palette,
  index,
  coverWidth,
  onOpenBook,
}: UnitProps) {
  const textured = useUnitLod(index);
  const active = useStacks((state) => state.activeUnit === index);
  useEffect(() => {
    if (active) void loadSecretReadingRoom();
  }, [active]);
  /**
   * THE FEATURED SHELF — the owner's own `Featured?` checkbox in Notion, not a
   * rule of mine. `data.featuredBooks` arrives already filtered to books with a
   * cover and ordered newest-finished-first, and every one of them is also in
   * `shelfBooks`, so their covers are pre-decoded by Scene's warming pass and
   * clickable through the same `onOpenBook` the row has always used.
   *
   * NOTHING here hard-codes eight. It is a checkbox list: a ninth tick has to
   * appear on the shelf and an untick has to close the gap, so the layout reads
   * `featured.length` and sizes itself. An EMPTY list — which is what runtime
   * gives until the pending Postgres migration lands — renders no front row at
   * all and leaves two full packed rows of spines behind it. That is a shelf,
   * not a hole; do not "fix" the emptiness.
   *
   * Match is on `book.id`, never on title: the library has two reads of
   * "7 Habits of Highly Effective People" and only the 2023 one is ticked.
   */
  const featured = useMemo(
    () =>
      data.featuredBooks
        .filter((book) => book.coverUrl)
        .map((book) => ({ url: book.coverUrl!, key: book.id })),
    [data.featuredBooks],
  );

  /**
   * HOW A FEATURED BOOK IS HIGHLIGHTED, and why it is not a graphic.
   *
   * The brief is "highlight those on the bookshelf", and the house rules rule
   * out the obvious answers — no pills, no badges, no glow, nothing that reads
   * as UI pasted onto a 3D object. A bookshelf already has a vocabulary for
   * "this one matters" and it is physical: you turn the book cover-out and you
   * stand it in front of the row instead of in it.
   *
   * So the packed rows behind are now spines ONLY (packRow is given no covers),
   * and the featured books stand as their own short row 0.12 forward of them,
   * face to the viewer. Three things fall out of that and all three are what
   * makes it read at a 2.24° grazing camera:
   *   - a cover is 0.36 × 0.52 against a spine's 0.055…0.130 wide, so the
   *     featured books are the only wide masses on the shelf;
   *   - standing 0.12 proud puts them clear of the stepped spine fronts (which
   *     sit at about z 0.02) and under the top plank's own light fixture, so
   *     they are the lit objects and the row behind them is the dark one;
   *   - they are the only books on the unit that open a NOTE rather than the
   *     library, which the hover lift already advertises.
   *
   * WHAT IT MUST NOT BE is the thing it was: four covers per shelf at one
   * pitch, one size, one angle, one depth, both rows starting at the same x.
   * "Featured" has to come from being cover-out and standing proud of the row
   * — not from being regimented — so the variation all lives INSIDE that.
   * `layoutFeatured` above owns it; the only thing decided here is how many
   * books each shelf gets.
   *
   * The split is 60/40 rather than half and half, capped at what a shelf can
   * hold. An even split is the arrangement that lets a reader pair every book
   * with the one above it, which is most of what "grid" means; 5 and 3 has no
   * such pairing. Both rows still size themselves off `featured.length`, so a
   * ninth tick lands on the lower shelf, an untick closes the gap, and an
   * empty list renders no front rank at all.
   */
  const [topFeatured, lowerFeatured] = useMemo(() => {
    const top = Math.min(
      SHELF_CAP,
      Math.max(1, Math.ceil(featured.length * TOP_SHARE)),
    );
    return [
      layoutFeatured(featured.slice(0, top), 16, EDGE_L_TOP),
      layoutFeatured(featured.slice(top), 41, EDGE_L_LOWER),
    ];
  }, [featured]);

  /** The rows BEHIND the featured books. No covers at all now — the packed
   * block is scenery, and giving it covers put a second, competing face-out
   * book in a row whose whole job is to be the quiet backdrop the featured
   * ones stand against. Passing `[]` also retires the old coupling where the
   * number of featured books was an OUTPUT of packRow's salt. */
  const topRow = useMemo(() => packRow(2.42, [], palette, 15), [palette]);
  const lowerRow = useMemo(() => packRow(2.28, [], palette, 40), [palette]);

  // Replace one ordinary generated spine — don't layer a trigger in front of
  // it. The selection is geometric rather than an array magic number so a
  // future packing retune still picks a readable right-hand spine.
  const secretIndex = pickSecretSpineIndex(topRow);
  const secretItem = secretIndex >= 0 ? topRow[secretIndex] : undefined;
  const visibleTopRow = useMemo(
    () => topRow.filter((_, itemIndex) => itemIndex !== secretIndex),
    [secretIndex, topRow],
  );
  const secretDepth =
    secretIndex >= 0 ? 0.26 + rand(secretIndex, 26) * 0.08 : 0.3;
  const interactionInput = useMemo(
    () =>
      ({
        unitIndex: index,
        expectedFeaturedIds: featured.map((book) => book.key),
        rows: [
          {
            shelf: "top",
            salt: 16,
            role: "featured",
            items: topFeatured,
          },
          {
            shelf: "lower",
            salt: 41,
            role: "featured",
            items: lowerFeatured,
          },
          {
            shelf: "top",
            salt: 15,
            role: "packed",
            items: visibleTopRow,
          },
          {
            shelf: "lower",
            salt: 40,
            role: "packed",
            items: lowerRow,
          },
        ],
        secret:
          secretItem?.kind === "spine"
            ? {
                shelf: "top",
                hoverKey: SECRET_HOVER,
                nodeName: "stacks-secret-book",
              }
            : undefined,
      }) satisfies BookInteractionInput,
    [
      featured,
      index,
      lowerFeatured,
      lowerRow,
      secretItem,
      topFeatured,
      visibleTopRow,
    ],
  );
  const interactionInventory = useMemo(
    () => buildBookInteractions(interactionInput),
    [interactionInput],
  );
  const doorPivot = useRef<THREE.Group>(null);
  const shelf = useRef<THREE.Group>(null);
  const portal = useRef<THREE.Group>(null);
  const portalInterior = useRef<THREE.Group>(null);
  const portalThreshold = useRef<THREE.Group>(null);
  const blocker = useRef<THREE.Mesh>(null);
  const blockerRaycast = useRef<THREE.Object3D["raycast"] | null>(null);
  const portalLight = useRef<THREE.PointLight>(null);
  const portalFillLight = useRef<THREE.PointLight>(null);
  const portalDust = useRef<THREE.Points>(null);
  const [secretPrimed, setSecretPrimed] = useState(false);

  useEffect(() => {
    // Canvas markup cannot expose a semantic census. This dev hook mirrors the
    // exact arrays rendered below so QA can address every physical volume and
    // prove that one hover key moves one book only.
    setBookInteractionInventory(interactionInput);
    return () => setBookInteractionInventory(null);
  }, [interactionInput]);

  // Motion preference can change without a reload. The direct-manipulation
  // pull remains direct; the autonomous bookcase/camera choreography snaps.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setBookSecretReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // The open passage owns lateral travel, but only while this unit owns the
  // camera. Rail/deep-link navigation closes it and immediately releases the
  // scroll element; the closing animation can finish while travel proceeds.
  useEffect(() => {
    let saved:
      | { el: HTMLDivElement; overflowX: string; touchAction: string }
      | undefined;
    const engaged = () => {
      const phase = bookSecretRef.phase;
      return (
        useStacks.getState().activeUnit === index &&
        (phase === "opening" ||
          phase === "open" ||
          phase === "pulling-close" ||
          phase === "closing")
      );
    };
    const syncLock = () => {
      const state = useStacks.getState();
      if (bookSecretRef.phase !== "closed") setSecretPrimed(true);
      if (state.activeUnit !== index && bookSecretRef.phase !== "closed")
        closeBookSecret();
      const el = state.scrollEl;
      if (engaged() && el && !saved) {
        saved = {
          el,
          overflowX: el.style.overflowX,
          touchAction: el.style.touchAction,
        };
        el.style.overflowX = "hidden";
        el.style.touchAction = "none";
      } else if ((!engaged() || saved?.el !== el) && saved) {
        saved.el.style.overflowX = saved.overflowX;
        saved.el.style.touchAction = saved.touchAction;
        saved = undefined;
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!engaged()) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-stacks-scrollable]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && bookSecretRef.phase !== "closed")
        closeBookSecret();
    };
    const unsubscribeSecret = subscribeBookSecret(syncLock);
    const unsubscribeStore = useStacks.subscribe(syncLock);
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keydown", onKey);
    syncLock();
    return () => {
      unsubscribeSecret();
      unsubscribeStore();
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKey);
      if (saved) {
        saved.el.style.overflowX = saved.overflowX;
        saved.el.style.touchAction = saved.touchAction;
      }
      resetBookSecret();
    };
  }, [index]);

  useFrame(({ clock }) => {
    // Reduced motion crossfades the actual shelf and room materials in place;
    // the normal score eases those surfaces forward from deeper in the bay.
    // No full-bay colour plane participates in either path.
    const reduced = bookSecretRef.reducedMotion;
    const score = bookSecretRenderScore(bookSecretRef.visualProgress, reduced);
    const { visual, ...renderedScore } = score;
    const { door, threshold, room } = visual;
    const { doorAngle } = score;
    const portalVisible = secretPrimed;
    if (doorPivot.current) {
      // Hinge on the left jamb. The old 3.18-unit lateral slide physically
      // crossed into Weightlifting on mobile; this 87° swing clears the full
      // opening while its swept volume stays inside the Books bay.
      doorPivot.current.rotation.y = doorAngle;
      // Once an in-place reduced-motion crossfade is complete, park the fully
      // transparent case outside the raycast volume.
      doorPivot.current.position.y =
        reduced && score.shelfOpacity <= 0.001
          ? 100
          : Math.sin(door * Math.PI) * 0.016;
      doorPivot.current.position.z = Math.sin(door * Math.PI) * 0.025;
      doorPivot.current.visible = true;
      setSecretSurfaceOpacity(doorPivot.current, score.shelfOpacity);
    }
    if (shelf.current) {
      shelf.current.position.x = SECRET_DOOR_CENTER_X;
      shelf.current.position.z = Math.sin(door * Math.PI) * 0.085;
    }
    if (portalThreshold.current) {
      portalThreshold.current.position.z = score.thresholdZ;
      portalThreshold.current.scale.set(1, 0.985 + threshold * 0.015, 1);
      setSecretSurfaceOpacity(portalThreshold.current, score.thresholdOpacity);
    }
    if (portalInterior.current) {
      portalInterior.current.position.z = score.roomZ;
      const scale = 0.982 + room * 0.018;
      portalInterior.current.scale.set(scale, scale, 1);
      setSecretSurfaceOpacity(portalInterior.current, score.roomOpacity);
    }
    if (blocker.current) {
      if (!blockerRaycast.current && blocker.current.raycast !== NO_RAYCAST)
        blockerRaycast.current = blocker.current.raycast.bind(blocker.current);
      const blocking =
        bookSecretRef.phase !== "closed" ||
        bookSecretRef.visualProgress > 0.0001;
      blocker.current.visible = true;
      blocker.current.raycast =
        blocking && blockerRaycast.current
          ? blockerRaycast.current
          : NO_RAYCAST;
    }
    if (portalLight.current) portalLight.current.intensity = score.keyLight;
    if (portalFillLight.current)
      portalFillLight.current.intensity = score.fillLight;
    if (portalDust.current) {
      if (!bookSecretRef.reducedMotion) {
        portalDust.current.rotation.y =
          Math.sin(clock.elapsedTime * 0.12) * 0.07 * room;
        portalDust.current.position.y =
          Math.sin(clock.elapsedTime * 0.31) * 0.022 * room;
      }
      const material = portalDust.current.material as THREE.PointsMaterial;
      material.opacity = score.dustOpacity;
    }
    Object.assign(bookSecretRef.rendered, {
      ...renderedScore,
      portalVisible,
    });
  });

  return (
    <group>
      {process.env.NODE_ENV !== "production" && (
        <BookInteractionProbe
          index={index}
          root={doorPivot}
          inventory={interactionInventory}
        />
      )}
      {(secretPrimed || active) && (
        <React.Suspense fallback={null}>
          <SecretReadingRoom
            palette={palette}
            groupRef={portal}
            interiorRef={portalInterior}
            thresholdRef={portalThreshold}
            keyLightRef={portalLight}
            fillLightRef={portalFillLight}
            dustRef={portalDust}
            returnControl={<SecretReturnHandle />}
          />
        </React.Suspense>
      )}
      <group
        ref={doorPivot}
        name="stacks-secret-bookcase-door"
        position={[SECRET_DOOR_HINGE_X, 0, 0]}
      >
        <group ref={shelf} position={[SECRET_DOOR_CENTER_X, 0, 0]}>
          <SecretShelfAffordance index={index} />
          <ShelfUnit
            palette={palette}
            toneSeed={index}
            lower={
              <group>
                <group position={[0, 0, 0]}>
                  <BookRowMesh
                    items={lowerRow}
                    palette={palette}
                    salt={40}
                    textured={textured}
                    coverWidth={coverWidth}
                    onCoverClick={onOpenBook}
                    linkUnit={index}
                  />
                  {/* L-steel pair holds the short row's loose start. It is
                    authored 2.6° off plumb — a bookend takes the row's lean —
                    and the pointer eases it upright, as if you had just
                    straightened the shelf. Same rest+settle channel the
                    photographs use, so it settles on the house curve. */}
                  <HoverProp
                    unitIndex={index}
                    hoverKey="bookend:books:lower"
                    base={[-1.18, 0, 0]}
                    lift={[0, 0, 0.012]}
                    rest={[0, 0, -0.046]}
                    settle={0.046}
                  >
                    <Bookend palette={palette} />
                    <BookendTarget />
                  </HoverProp>
                </group>
                {/* The featured half of the shelf, standing 0.12 forward of the
                  packed spines — see the note on the layout above. */}
                {lowerFeatured.length > 0 && (
                  <group position={[0, 0, 0.12]}>
                    <BookRowMesh
                      items={lowerFeatured}
                      palette={palette}
                      salt={41}
                      textured={textured}
                      coverWidth={coverWidth}
                      onCoverClick={onOpenBook}
                      linkUnit={index}
                      grabbableCovers
                    />
                  </group>
                )}
              </group>
            }
          >
            {/* The featured half of the shelf, standing 0.12 forward of the
              packed spines. It is a sibling of the packed row rather than a
              child of it, because the row's own group carries an x offset for
              the placard and the featured layout is solved in unit space. */}
            {topFeatured.length > 0 && (
              <group position={[0, 0, 0.12]}>
                <BookRowMesh
                  items={topFeatured}
                  palette={palette}
                  salt={16}
                  textured={textured}
                  coverWidth={coverWidth}
                  onCoverClick={onOpenBook}
                  linkUnit={index}
                  grabbableCovers
                />
              </group>
            )}
            <group position={[-0.05, 0, 0]}>
              <BookRowMesh
                items={visibleTopRow}
                palette={palette}
                salt={15}
                textured={textured}
                coverWidth={coverWidth}
                onCoverClick={onOpenBook}
                linkUnit={index}
              />
              {secretItem?.kind === "spine" && (
                <SecretPullBook
                  index={index}
                  palette={palette}
                  // In the natural gap between the second and third face-out
                  // covers, safely clear of both the rail and reading dock.
                  x={secretItem.x}
                  width={Math.max(0.074, secretItem.w)}
                  height={secretItem.h}
                  depth={secretDepth}
                />
              )}
              {/* Its twin on the top row, leaning the other way against the
                packed spines. */}
              <HoverProp
                unitIndex={index}
                hoverKey="bookend:books:top"
                base={[-1.22, 0, 0]}
                lift={[0, 0, 0.012]}
                rest={[0, 0, 0.042]}
                settle={0.042}
              >
                <Bookend palette={palette} />
                <BookendTarget />
              </HoverProp>
            </group>
          </ShelfUnit>
          {/* Once the bookcase starts moving it becomes one coherent door, not
              a shelf of simultaneously draggable props. `visible={false}` is
              not an input gate in three/r3f, so the raycast method itself is
              enabled only while the reveal owns this moving case. */}
          <mesh
            ref={blocker}
            position={[0, -0.22, 0.68]}
            onPointerOver={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <planeGeometry args={[3.1, 2.35]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
