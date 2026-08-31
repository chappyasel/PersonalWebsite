// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProgressivePreviewImage } from "./ProgressivePreviewImage";
import {
  ARTIFACT_PREVIEW_DETAIL_IN_START,
  ARTIFACT_PREVIEW_DETAIL_OUT_START,
  ARTIFACT_PREVIEW_DURATION_MS,
} from "./artifactPreviewMotion";

function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

describe("progressive artifact preview image", () => {
  it("keeps the scene-sized image painted until the master decodes", async () => {
    const decode = deferred();
    const { container } = render(
      <ProgressivePreviewImage
        previewSrc="/preview.webp"
        detailSrc="/master.webp"
        className="photo"
        style={{ width: 400, height: 500 }}
      />,
    );
    const preview = container.querySelector(
      "[data-scene-artifact-preview-photo-base]",
    );
    const detail = container.querySelector<HTMLImageElement>(
      "[data-scene-artifact-preview-photo-detail]",
    )!;
    const decodeImage = vi.fn(() => decode.promise);
    Object.defineProperty(detail, "decode", {
      configurable: true,
      value: decodeImage,
    });

    fireEvent.load(detail);
    expect(decodeImage).toHaveBeenCalledOnce();
    expect(preview).not.toBeNull();
    expect(
      detail.hasAttribute("data-scene-artifact-preview-photo-decoded"),
    ).toBe(false);

    await act(async () => decode.resolve());

    expect(preview).not.toBeNull();
    expect(
      detail.hasAttribute("data-scene-artifact-preview-photo-decoded"),
    ).toBe(true);
    expect(
      detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
    ).toBe(true);
  });

  it("holds a cached master until the middle of the opening flight", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <ProgressivePreviewImage
          previewSrc="/preview.webp"
          detailSrc="/master.webp"
          className="photo"
          style={{}}
          opening
        />,
      );
      const detail = container.querySelector<HTMLImageElement>(
        "[data-scene-artifact-preview-photo-detail]",
      )!;
      Object.defineProperty(detail, "decode", {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });

      fireEvent.load(detail);
      await act(async () => undefined);
      expect(
        detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
      ).toBe(false);

      const revealAt =
        ARTIFACT_PREVIEW_DURATION_MS * ARTIFACT_PREVIEW_DETAIL_IN_START;
      await act(async () => vi.advanceTimersByTime(revealAt - 1));
      expect(
        detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
      ).toBe(false);
      await act(async () => vi.advanceTimersByTime(1));
      expect(
        detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to the scene-sized image during the middle of close", async () => {
    vi.useFakeTimers();
    try {
      const props = {
        previewSrc: "/preview.webp",
        detailSrc: "/master.webp",
        className: "photo",
        style: {},
      } as const;
      const { container, rerender } = render(
        <ProgressivePreviewImage {...props} />,
      );
      const detail = container.querySelector<HTMLImageElement>(
        "[data-scene-artifact-preview-photo-detail]",
      )!;
      Object.defineProperty(detail, "decode", {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });
      fireEvent.load(detail);
      await act(async () => undefined);
      expect(
        detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
      ).toBe(true);

      rerender(<ProgressivePreviewImage {...props} dismissing />);
      const hideAt =
        ARTIFACT_PREVIEW_DURATION_MS * ARTIFACT_PREVIEW_DETAIL_OUT_START;
      await act(async () => vi.advanceTimersByTime(hideAt - 1));
      expect(
        detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
      ).toBe(true);
      await act(async () => vi.advanceTimersByTime(1));
      expect(
        detail.hasAttribute("data-scene-artifact-preview-photo-detail-visible"),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the durable preview visible when the master decode fails", async () => {
    const decode = deferred();
    const { container } = render(
      <ProgressivePreviewImage
        previewSrc="/preview.webp"
        detailSrc="/master.webp"
        className="photo"
        style={{}}
      />,
    );
    const detail = container.querySelector<HTMLImageElement>(
      "[data-scene-artifact-preview-photo-detail]",
    )!;
    Object.defineProperty(detail, "decode", {
      configurable: true,
      value: vi.fn(() => decode.promise),
    });

    fireEvent.load(detail);
    await act(async () => decode.reject());

    expect(
      container.querySelector("[data-scene-artifact-preview-photo-base]"),
    ).not.toBeNull();
    expect(
      detail.hasAttribute("data-scene-artifact-preview-photo-decoded"),
    ).toBe(false);
  });

  it("does not duplicate an image when the scene already uses the master", () => {
    const { container } = render(
      <ProgressivePreviewImage
        previewSrc="/same.webp"
        detailSrc="/same.webp"
        className="photo"
        style={{}}
      />,
    );

    expect(
      container.querySelectorAll("[data-scene-artifact-preview-photo]"),
    ).toHaveLength(1);
  });
});
