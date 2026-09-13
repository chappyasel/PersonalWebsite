"use client";

import { worldBoot } from "../boot/worldBootSession";
import type { StacksData } from "../data";
import { useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  Matrix4,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Sprite,
  Vector3,
} from "three";

import {
  type RoomArtworkRegistration,
  getRoomArtwork,
  serializeRoomBooksArtworkIdentity,
} from "./artwork";
import { handoffCamera } from "./handoffCamera";
import { illustrationInteraction } from "./illustrationInteraction";
import type { Rectangle } from "./projection";
import {
  type RegisteredShelf,
  ShelfAlignmentError,
  ShelfNotMountedError,
  registerAboutShelf,
  registerCapturedShelf,
} from "./registration";

const subscribe = (listener: () => void) => worldBoot.subscribe(listener);
const getView = () => worldBoot.getView();
type SavedNode = {
  node: Object3D;
  world: Matrix4;
  auto: boolean;
  visible: boolean;
};
type Target = {
  key: string;
  unit: number;
  box: Rectangle;
  viewport: Rectangle;
  source: RoomArtworkRegistration | null;
  dataIdentity?: string;
};

/** The boot machine owns timing. This adapter only matches, paints and executes its camera command. */
export default function SceneHandoff({ data }: { data: StacksData }) {
  const view = useSyncExternalStore(subscribe, getView, getView);
  // The disabled and live paths have no frame subscription or scene traversal.
  if (
    !view.motionEnabled ||
    view.ogCapture ||
    view.presentation === "live" ||
    view.presentation === "document"
  )
    return null;
  return (
    <ActiveSceneHandoff
      key={view.epoch}
      illustrationKey={view.illustrationKey}
      data={data}
    />
  );
}

function ActiveSceneHandoff({
  illustrationKey,
  data,
}: {
  illustrationKey: string | null;
  data: StacksData;
}) {
  const { scene, camera, gl } = useThree();
  const scope = useRef(worldBoot.scope()).current;
  const run = useRef({
    target: null as Target | null,
    shelf: null as RegisteredShelf | null,
    preparing: false,
    ordinaryOnly: false,
    lastAttempt: 0,
    lastError: "",
    pendingMesh: "",
    targetWait: "",
    ordinary: new PerspectiveCamera(),
    overridden: false,
    nodes: [] as SavedNode[],
    nodesOverridden: false,
    painted: 0,
    frame: 0,
    lastPaint: -1,
    armed: false,
    arrived: false,
    startPosition: new Vector3(),
    startQuaternion: new Quaternion(),
    startScale: new Vector3(),
  });

  const restore = () => {
    const r = run.current;
    if (r.nodesOverridden) {
      for (const saved of r.nodes) {
        saved.node.matrixWorld.copy(saved.world);
        saved.node.matrixWorldAutoUpdate = saved.auto;
        saved.node.visible = saved.visible;
      }
      r.nodesOverridden = false;
    }
    if (r.overridden) {
      (camera as PerspectiveCamera).copy(r.ordinary, false);
      camera.updateMatrixWorld(true);
      r.overridden = false;
    }
  };

  useEffect(() => {
    const r = run.current;
    restore();
    r.target = null;
    r.shelf = null;
    r.painted = 0;
    r.armed = false;
    r.preparing = false;
    r.ordinaryOnly = false;
    r.arrived = false;
    r.lastError = "";
    if (!illustrationKey) {
      r.targetWait = "no-key";
      return;
    }
    const controller = new AbortController();
    const element = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-room-artwork][data-artwork-key][data-unit][data-theme]",
      ),
    ).find((node) => node.dataset.artworkKey === illustrationKey);
    if (!element) {
      r.targetWait = "element-not-found";
      return;
    }
    let loading = false;
    const measure = () => {
      if (controller.signal.aborted || loading) return;
      const box = element.getBoundingClientRect();
      const canvasBox = gl.domElement.getBoundingClientRect();
      if (!box.width || !box.height || !canvasBox.width || !canvasBox.height) {
        r.targetWait = "waiting-layout";
        return;
      }
      loading = true;
      observer.disconnect();
      r.targetWait = "loading";
      const unit = Number(element.dataset.unit);
      const target: Target = {
        key: illustrationKey,
        unit,
        box,
        viewport: canvasBox,
        source: null,
      };
      const load = async () => {
        if (unit !== 0) {
          const asset = getRoomArtwork(
            unit,
            element.dataset.theme === "dark" ? "dark" : "light",
            innerWidth < 1200 && innerWidth / innerHeight <= 0.75
              ? "phone"
              : "desktop",
          );
          if (!asset) throw new Error("No artwork for this room stop");
          const response = await fetch(asset.registrationSrc, {
            signal: controller.signal,
          });
          if (!response.ok)
            throw new Error("Shelf registration could not load");
          target.source = (await response.json()) as RoomArtworkRegistration;
          if (
            target.source.sourceFingerprint !== asset.sourceFingerprint ||
            target.source.index !== unit
          )
            throw new Error("Artwork and registration revisions differ");
        }
        if (unit === 1) {
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(serializeRoomBooksArtworkIdentity(data)),
          );
          target.dataIdentity = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
        }
        if (!controller.signal.aborted) r.target = target;
      };
      void load().catch((error: unknown) => {
        if (controller.signal.aborted) return;
        r.lastError = String(error);
        scope.send({ type: "illustrationUnavailable", key: illustrationKey });
      });
    };
    // R3F can mount this effect while its canvas is still detached or zero-sized.
    // Observe initial attachment instead of treating an early empty rect as final.
    const observer = new ResizeObserver(measure);
    observer.observe(gl.domElement);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      controller.abort();
      restore();
    };
    // The active artwork publishes a new key after every decode, resize or theme change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [illustrationKey, camera, gl, scope]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const previous = scene.onAfterRender;
    scene.onAfterRender = function (...args) {
      previous.apply(this, args);
      const r = run.current;
      const current = worldBoot.getView();
      if (
        args[2] !== camera ||
        current.epoch !== scope.epoch ||
        illustrationInteraction.moving ||
        current.illustrationKey !== r.target?.key
      )
        return;
      if (r.armed && r.lastPaint !== r.frame) {
        r.painted++;
        r.lastPaint = r.frame;
        if (r.painted === 2)
          scope.send({
            type: r.ordinaryOnly
              ? "illustrationOrdinaryPainted"
              : "illustrationRegistered",
            key: r.target.key,
          });
      }
      if (r.arrived && current.presentation === "travel") {
        r.arrived = false;
        scope.send({ type: "illustrationTravelCompleted", key: r.target.key });
      }
      if (process.env.NODE_ENV === "development") {
        const diagnostics = window as Window & {
          __roomHandoff?: Record<string, unknown>;
        };
        diagnostics.__roomHandoff = {
          ...diagnostics.__roomHandoff,
          key: r.target.key,
          presentation: current.presentation,
          painted: r.painted,
          residuals: r.shelf?.residuals,
          alignment: r.ordinaryOnly ? "ordinary-fade" : "matched",
          error: r.lastError,
          camera: camera.matrixWorld.toArray(),
          projection: camera.projectionMatrix.toArray(),
        };
      }
    };
    return () => {
      scene.onAfterRender = previous;
      restore();
    };
    // Restore the callback identity and camera on unmount or renderer replacement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera, scope]);

  useFrame(restore, -998);
  useFrame(() => {
    const r = run.current;
    r.frame++;
    r.armed = false;
    const current = worldBoot.getView();
    const target = r.target;
    const room = useStacks.getState();
    if (
      illustrationInteraction.moving ||
      room.panelState !== "closed" ||
      room.modalOpen
    ) {
      r.painted = 0;
      r.arrived = false;
      return;
    }
    if (process.env.NODE_ENV === "development") {
      const debug = window as Window & { __roomHandoff?: object };
      debug.__roomHandoff = {
        ...debug.__roomHandoff,
        targetWait: r.targetWait,
        pendingMesh: r.pendingMesh,
        stage: !target
          ? "waiting-artwork"
          : !r.shelf
            ? "registering"
            : "painting",
        target: Boolean(target),
        key: current.illustrationKey,
        aimError: handoffCamera.aimError,
        hidden: document.hidden,
        frame: r.frame,
        error: r.lastError,
      };
    }
    if (
      !target ||
      current.epoch !== scope.epoch ||
      current.illustrationKey !== target.key ||
      !current.motionEnabled ||
      current.interactionHeld ||
      document.hidden
    )
      return;
    const now = performance.now();
    if (!r.shelf) {
      if (
        r.preparing ||
        now - r.lastAttempt < 250 ||
        !current.canvasReady ||
        current.waitStage !== "opening" ||
        Math.abs(handoffCamera.scenePosition - target.unit) > 0.0005 ||
        Math.abs(handoffCamera.scrollError) > 0.00001 ||
        Math.abs(handoffCamera.aimError) > 0.0005
      )
        return;
      r.lastAttempt = now;
      const unit = scene.getObjectByName(`room-unit:${target.unit}`);
      if (!unit) return;
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const restCamera = (camera as PerspectiveCamera).clone();
      r.preparing = true;
      const prepare = (shelf: RegisteredShelf, ordinaryOnly = false) => {
        if (
          r.target !== target ||
          worldBoot.getView().illustrationKey !== target.key
        )
          return;
        r.shelf = shelf;
        r.ordinaryOnly = ordinaryOnly;
        r.pendingMesh = "";
        r.nodes = [];
        if (!ordinaryOnly)
          scene.traverse((node) => {
            if (node instanceof Mesh || node instanceof Sprite)
              r.nodes.push({
                node,
                world: new Matrix4(),
                auto: true,
                visible: true,
              });
          });
        shelf.world.decompose(r.startPosition, r.startQuaternion, r.startScale);
        r.painted = 0;
      };
      void Promise.resolve()
        .then(() =>
          target.source
            ? registerCapturedShelf(
                unit,
                target.source,
                target.box,
                target.viewport,
                target.dataIdentity,
                restCamera,
              )
            : registerAboutShelf(unit, target.box, target.viewport, restCamera),
        )
        .then((shelf) => prepare(shelf))
        .catch((error: unknown) => {
          if (r.target !== target) return;
          if (error instanceof ShelfNotMountedError) {
            // Nested Suspense can commit a prop after LoadingManager reports
            // an idle network. Keep the drawing until its actual mesh mounts.
            r.pendingMesh = error.message;
            return;
          }
          if (error instanceof ShelfAlignmentError) {
            // A projection mismatch is not a renderer failure. Keep the
            // ordinary camera still and prove two painted frames before fading.
            prepare(
              {
                world: restCamera.matrixWorld.clone(),
                projection: restCamera.projectionMatrix.clone(),
                meshes: new Map(),
                residuals: error.residuals,
              },
              true,
            );
            return;
          }
          r.lastError = String(error);
          if (process.env.NODE_ENV === "development") {
            (window as Window & { __roomHandoff?: unknown }).__roomHandoff = {
              key: target.key,
              error: r.lastError,
              restCamera: restCamera.matrixWorld.toArray(),
              restProjection: restCamera.projectionMatrix.toArray(),
              box: target.box,
            };
          }
          scope.send({ type: "illustrationUnavailable", key: target.key });
        })
        .finally(() => {
          if (r.target === target) r.preparing = false;
        });
      return;
    }
    r.ordinary.copy(camera as PerspectiveCamera, false);
    r.overridden = true;
    if (
      current.presentation === "illustrated" ||
      current.presentation === "dissolve"
    ) {
      camera.position.copy(r.startPosition);
      camera.quaternion.copy(r.startQuaternion);
      camera.scale.copy(r.startScale);
      camera.updateMatrixWorld(true);
      camera.projectionMatrix.copy(r.shelf.projection);
      camera.projectionMatrixInverse.copy(r.shelf.projection).invert();
      for (const saved of r.nodes) {
        const node = saved.node;
        saved.world.copy(node.matrixWorld);
        saved.auto = node.matrixWorldAutoUpdate;
        saved.visible = node.visible;
        const rest = r.shelf.meshes.get(node as Mesh);
        if (rest) {
          node.matrixWorldAutoUpdate = false;
          node.matrixWorld.copy(rest);
        } else if (current.presentation === "illustrated") {
          node.visible = false;
        }
        // The ordinary surroundings appear beneath the fading atmosphere,
        // so plants and meadow do not pop in on the final frame.
      }
      r.nodesOverridden = true;
      r.armed = true;
    } else if (
      current.presentation === "travel" &&
      current.handoffStartedAt !== null
    ) {
      // The drawing was placed against this ordinary camera. The final
      // handoff step only acknowledges a painted frame; it never moves it.
      r.arrived = true;
    }
  });
  return null;
}
