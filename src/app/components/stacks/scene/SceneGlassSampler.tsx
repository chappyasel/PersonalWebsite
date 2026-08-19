"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  sceneGlassCaptureDimensions,
  sceneGlassDataUrl,
  sceneGlassSnapshotController,
  useSceneGlassSnapshot,
} from "./sceneGlassSnapshot";

/**
 * Captures the already-authored scene into a tiny color field after the
 * camera settles. It deliberately does not track wind, wildlife, or physics:
 * the placard wants the backdrop's broad spatial color, not another live
 * full-resolution effect.
 */
export default function SceneGlassSampler({
  variant,
  paused,
}: {
  variant: string;
  paused: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const snapshot = useSceneGlassSnapshot();
  const dimensions = useMemo(
    () => sceneGlassCaptureDimensions(size.width, size.height),
    [size.height, size.width],
  );
  const target = useMemo(() => {
    const renderTarget = new THREE.WebGLRenderTarget(
      dimensions.captureWidth,
      dimensions.captureHeight,
      {
        depthBuffer: true,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      },
    );
    renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    return renderTarget;
  }, [dimensions.captureHeight, dimensions.captureWidth]);
  const capturedRevision = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => {
    sceneGlassSnapshotController.request(
      `variant:${variant}:${dimensions.captureWidth}x${dimensions.captureHeight}`,
    );
  }, [dimensions.captureHeight, dimensions.captureWidth, variant]);

  useFrame(() => {
    const requestRevision = snapshot.requestRevision;
    if (
      paused ||
      inFlight.current ||
      requestRevision <= capturedRevision.current
    )
      return;

    capturedRevision.current = requestRevision;
    inFlight.current = true;
    const pixels = new Uint8Array(
      dimensions.captureWidth * dimensions.captureHeight * 4,
    );
    const previousTarget = gl.getRenderTarget();
    const previousToneMapping = gl.toneMapping;
    const previousAutoClear = gl.autoClear;

    let read: Promise<Uint8Array>;
    try {
      // EffectComposer temporarily owns tone mapping while mounted. The tiny
      // direct render must use the base scene's approved ACES mapping so its
      // colors match both composer and composer-off paths.
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.autoClear = true;
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(scene, camera);
      read = gl.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        dimensions.captureWidth,
        dimensions.captureHeight,
        pixels,
      ) as Promise<Uint8Array>;
    } catch {
      gl.setRenderTarget(previousTarget);
      gl.toneMapping = previousToneMapping;
      gl.autoClear = previousAutoClear;
      inFlight.current = false;
      sceneGlassSnapshotController.fail(requestRevision);
      return;
    }

    gl.setRenderTarget(previousTarget);
    gl.toneMapping = previousToneMapping;
    gl.autoClear = previousAutoClear;

    void read
      .catch(() => {
        // Some WebGL implementations cannot take the asynchronous PBO path.
        // A single tiny synchronous fallback after travel is still bounded
        // and preferable to silently losing sampled glass on that device.
        gl.readRenderTargetPixels(
          target,
          0,
          0,
          dimensions.captureWidth,
          dimensions.captureHeight,
          pixels,
        );
        return pixels;
      })
      .then((resolved) => {
        const dataUrl = sceneGlassDataUrl(
          resolved,
          dimensions.captureWidth,
          dimensions.captureHeight,
          dimensions.outputWidth,
          dimensions.outputHeight,
        );
        sceneGlassSnapshotController.publish(requestRevision, dataUrl);
      })
      .catch(() => {
        sceneGlassSnapshotController.fail(requestRevision);
      })
      .finally(() => {
        inFlight.current = false;
      });
  });

  return null;
}
