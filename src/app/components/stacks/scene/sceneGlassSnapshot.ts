import { useSyncExternalStore } from "react";

export type SceneGlassSnapshot = Readonly<{
  requestRevision: number;
  imageRevision: number;
  reason: string;
  status: "idle" | "pending" | "ready" | "failed";
  dataUrl: string | null;
}>;

const EMPTY_SCENE_GLASS_SNAPSHOT: SceneGlassSnapshot = Object.freeze({
  requestRevision: 0,
  imageRevision: 0,
  reason: "initial",
  status: "idle",
  dataUrl: null,
});

export function sceneGlassCaptureDimensions(
  cssWidth: number,
  cssHeight: number,
) {
  const width = Math.max(1, cssWidth);
  const height = Math.max(1, cssHeight);
  const dimensions = (longEdge: number) => {
    const scale = longEdge / Math.max(width, height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  };
  const capture = dimensions(192);
  const output = dimensions(96);
  return {
    captureWidth: capture.width,
    captureHeight: capture.height,
    outputWidth: output.width,
    outputHeight: output.height,
  };
}

/** WebGL reads rows bottom-up; ImageData and CSS images read them top-down. */
export function flipSceneGlassPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
) {
  const stride = width * 4;
  const flipped = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    const source = (height - y - 1) * stride;
    flipped.set(pixels.subarray(source, source + stride), y * stride);
  }
  return flipped;
}

/** Turn one tiny GPU capture into an even smaller, softly averaged CSS image.
 * This runs only after a settled-view request, never in the animation loop. */
export function sceneGlassDataUrl(
  pixels: Uint8Array,
  captureWidth: number,
  captureHeight: number,
  outputWidth: number,
  outputHeight: number,
) {
  const source = document.createElement("canvas");
  source.width = captureWidth;
  source.height = captureHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("Scene glass source canvas unavailable");
  const image = sourceContext.createImageData(captureWidth, captureHeight);
  image.data.set(flipSceneGlassPixels(pixels, captureWidth, captureHeight));
  sourceContext.putImageData(image, 0, 0);

  const output = document.createElement("canvas");
  output.width = outputWidth;
  output.height = outputHeight;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("Scene glass output canvas unavailable");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.filter = "blur(2px) saturate(0.82)";
  // Slight overscan prevents the tiny blur kernel from fading the image's
  // outermost samples toward transparent black.
  outputContext.drawImage(source, -3, -3, outputWidth + 6, outputHeight + 6);
  return output.toDataURL("image/png");
}

export function createSceneGlassSnapshotController() {
  let snapshot = EMPTY_SCENE_GLASS_SNAPSHOT;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    request(reason: string) {
      const requestRevision = snapshot.requestRevision + 1;
      snapshot = {
        ...snapshot,
        requestRevision,
        reason,
        status: "pending",
      };
      emit();
      return requestRevision;
    },
    publish(requestRevision: number, dataUrl: string) {
      if (requestRevision !== snapshot.requestRevision) return false;
      snapshot = {
        ...snapshot,
        imageRevision: requestRevision,
        status: "ready",
        dataUrl,
      };
      emit();
      return true;
    },
    fail(requestRevision: number) {
      if (requestRevision !== snapshot.requestRevision) return false;
      snapshot = { ...snapshot, status: "failed" };
      emit();
      return true;
    },
  };
}

export const sceneGlassSnapshotController =
  createSceneGlassSnapshotController();

export function useSceneGlassSnapshot() {
  return useSyncExternalStore(
    sceneGlassSnapshotController.subscribe,
    sceneGlassSnapshotController.getSnapshot,
    sceneGlassSnapshotController.getSnapshot,
  );
}
