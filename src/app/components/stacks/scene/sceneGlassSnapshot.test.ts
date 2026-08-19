import { describe, expect, it } from "vitest";

import {
  createSceneGlassSnapshotController,
  flipSceneGlassPixels,
  sceneGlassCaptureDimensions,
} from "./sceneGlassSnapshot";

describe("sampled scene glass", () => {
  it("bounds capture and display buffers while preserving viewport aspect", () => {
    expect(sceneGlassCaptureDimensions(1440, 900)).toEqual({
      captureWidth: 192,
      captureHeight: 120,
      outputWidth: 96,
      outputHeight: 60,
    });
    expect(sceneGlassCaptureDimensions(390, 844)).toEqual({
      captureWidth: 89,
      captureHeight: 192,
      outputWidth: 44,
      outputHeight: 96,
    });
  });

  it("turns WebGL's bottom-up rows into browser image order", () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...flipSceneGlassPixels(pixels, 1, 2)]).toEqual([
      5, 6, 7, 8, 1, 2, 3, 4,
    ]);
  });

  it("never publishes an obsolete capture over a newer request", () => {
    const controller = createSceneGlassSnapshotController();
    const first = controller.request("first");
    const second = controller.request("second");
    expect(controller.publish(first, "data:image/png;base64,old")).toBe(false);
    expect(controller.publish(second, "data:image/png;base64,new")).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      dataUrl: "data:image/png;base64,new",
      requestRevision: second,
      imageRevision: second,
      status: "ready",
    });
  });
});
