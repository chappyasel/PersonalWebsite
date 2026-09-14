// @vitest-environment jsdom
import { PALETTES } from "../theme";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewPrint } from "./SceneArtifactInspector";
import { BARE_ARTIFACT_PREVIEW_FRAME } from "./artifactPreviewFrame";
import {
  artifactPreviewPoseKeyframes,
  artifactPreviewPoseTransform,
} from "./artifactPreviewPose";

const originalAnimate = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "animate",
);
const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel }));

function printProps(size = { width: 350, height: 240 }) {
  const origin = { left: 110, top: 340, width: 120, height: 24 };
  const quad = [
    [120, 340],
    [220, 342],
    [230, 364],
    [110, 361],
  ] as const;
  return {
    attrs: {
      style: {
        ...size,
        transition:
          "transform 420ms cubic-bezier(0.4, 0, 0.2, 1), height 210ms cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
    size,
    scale: 1,
    frame: BARE_ARTIFACT_PREVIEW_FRAME,
    palette: PALETTES.dark,
    src: "/photo.webp",
    previewSrc: "/photo.webp",
    visible: true,
    opening: true,
    closing: false,
    openingPose: artifactPreviewPoseTransform(size, origin, quad),
    closingPose: artifactPreviewPoseTransform(size, origin, quad),
    openingPoseKeyframes: artifactPreviewPoseKeyframes(size, origin, quad),
    closingPoseKeyframes: artifactPreviewPoseKeyframes(size, origin, quad),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  animate.mockClear();
  cancel.mockClear();
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: animate,
  });
});

afterEach(() => {
  cleanup();
  if (originalAnimate)
    Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("preview print entrance", () => {
  it("starts the tilt in the viewer's moving commit, without a separate frame delay", async () => {
    const props = printProps();
    const { rerender } = render(
      <PreviewPrint {...props} attrs={{ style: props.size }} />,
    );
    await act(() => vi.advanceTimersByTime(500));
    expect(animate).not.toHaveBeenCalled();
    rerender(<PreviewPrint {...props} />);
    expect(animate).toHaveBeenCalledOnce();
  });
  it("does not reapply the shelf pose after the viewer has enlarged the print", async () => {
    const { rerender } = render(<PreviewPrint {...printProps()} />);
    await act(() => vi.advanceTimersByTime(48));
    expect(animate).toHaveBeenCalledOnce();

    // Caption measurement and frame registration rebuild the inspector's
    // images while the outer viewer continues its original entrance.
    for (let update = 0; update < 3; update += 1) {
      await act(() => vi.advanceTimersByTime(80));
      rerender(<PreviewPrint {...printProps()} />);
      await act(() => vi.advanceTimersByTime(48));
    }
    // An actual fit change also must not rewind the tilt.
    rerender(<PreviewPrint {...printProps({ width: 315, height: 216 })} />);
    await act(() => vi.advanceTimersByTime(48));
    expect(animate).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("lets the pose own foreshortening without also squashing the photo box", () => {
    const { container, rerender } = render(
      <PreviewPrint
        {...printProps()}
        attrs={{ style: { width: "350px", height: "70px" } }}
        scale={120 / 350}
      />,
    );
    const photo = container.querySelector<HTMLElement>(
      "[data-scene-artifact-preview-image]",
    )!;
    expect(photo.style.height).toBe("240px");

    // After zoom settles, the viewer bakes scale into its dimensions.
    rerender(
      <PreviewPrint
        {...printProps()}
        opening={false}
        attrs={{ style: { width: "700px", height: "480px" } }}
      />,
    );
    expect(photo.style.height).toBe("480px");
  });

  it("uses the latest fitted pose for close and clears it on a new opening", async () => {
    const { container, rerender } = render(<PreviewPrint {...printProps()} />);
    await act(() => vi.advanceTimersByTime(48));
    const resized = printProps({ width: 315, height: 216 });
    rerender(<PreviewPrint {...resized} opening={false} />);
    const photo = container.querySelector<HTMLElement>(
      "[data-scene-artifact-preview-image]",
    )!;
    expect(photo.style.transform).toBe("");
    expect(cancel).toHaveBeenCalledOnce();

    rerender(<PreviewPrint {...resized} opening={false} closing />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenLastCalledWith(
      [...resized.closingPoseKeyframes!].reverse().map((frame) => ({
        transform: frame.transform,
        offset: 1 - frame.offset,
      })),
      expect.any(Object),
    );
    rerender(<PreviewPrint {...resized} />);
    expect(cancel).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTime(48));
    expect(animate).toHaveBeenCalledTimes(3);
  });

  it("clears the initial pose if opening ends before the first animation frame", async () => {
    const moving = printProps();
    const props = { ...moving, attrs: { style: moving.size } };
    const { container, rerender } = render(<PreviewPrint {...props} />);
    const photo = container.querySelector<HTMLElement>(
      "[data-scene-artifact-preview-image]",
    )!;
    expect(photo.style.transform).toBe(props.openingPose);
    rerender(<PreviewPrint {...props} opening={false} />);
    await act(() => vi.advanceTimersByTime(48));
    expect(photo.style.transform).toBe("");
    expect(animate).not.toHaveBeenCalled();
  });

  it("skips pose animation with reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(<PreviewPrint {...printProps()} />);
    await act(() => vi.advanceTimersByTime(500));
    const photo = container.querySelector<HTMLElement>(
      "[data-scene-artifact-preview-image]",
    )!;
    expect(photo.style.transform).toBe("");
    expect(animate).not.toHaveBeenCalled();
  });
});
