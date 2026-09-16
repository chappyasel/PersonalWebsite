// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { registerOverlay } from "~/lib/overlays/coordinator";

import { DocumentGallery, ZoomableImage } from "./DocumentGallery";
import { artifactPreviewVisualEffects } from "~/app/components/stacks/scene/artifactPreviewVisualEffects";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  artifactPreviewVisualEffects.resetForTests();
  vi.unstubAllGlobals();
});

it("keeps its selection and remains open while a child overlay handles navigation and Escape", async () => {
  const view = render(
    <DocumentGallery>
      <ZoomableImage src="/one.webp" alt="One">
        <span>One</span>
      </ZoomableImage>
      <ZoomableImage src="/two.webp" alt="Two">
        <span>Two</span>
      </ZoomableImage>
    </DocumentGallery>,
  );
  await userEvent.click(
    view.getByRole("button", { name: "Enlarge image: One" }),
  );
  await waitFor(() =>
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "1 / 2",
    ),
  );
  const counter = document.querySelector('[aria-live="polite"]')!;
  const child = document.createElement("div");
  child.tabIndex = -1;
  document.body.append(child);
  const dismiss = vi.fn();
  const lease = registerOverlay({ kind: "command", surface: child, dismiss });
  try {
    child.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(counter.textContent).toBe("1 / 2");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(counter.isConnected).toBe(true);
  } finally {
    lease.release();
    child.remove();
  }
  fireEvent.keyDown(window, { key: "ArrowRight" });
  await waitFor(() => expect(counter.textContent).toBe("2 / 2"));
});

it("opens the selected image in one gallery and returns keyboard focus when closed", async () => {
  const user = userEvent.setup();
  const view = render(
    <DocumentGallery>
      <ZoomableImage
        src="/first.webp"
        alt="First image"
        caption="An original caption"
      >
        <span>First</span>
      </ZoomableImage>
      <ZoomableImage
        src="/second.webp"
        alt="Second image"
        width={400}
        height={400}
      >
        <span>Second</span>
      </ZoomableImage>
    </DocumentGallery>,
  );
  const second = view.getByRole("button", {
    name: "Enlarge image: Second image",
  });
  second.focus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "2 / 2",
    ),
  );
  expect(
    document.querySelector(".document-gallery-mask--blurred"),
  ).toBeTruthy();
  expect(document.querySelector("[data-artifact-preview-caption]")).toBeNull();
  act(() => artifactPreviewVisualEffects.setBackdropBlur(false));
  expect(document.querySelector(".document-gallery-mask--blurred")).toBeNull();
  act(() => artifactPreviewVisualEffects.setBackdropBlur(true));
  await waitFor(() =>
    expect(
      document.querySelector<HTMLImageElement>('img[src="/second.webp"]')!.style
        .width,
    ).toBe("608px"),
  );
  fireEvent.keyDown(window, { key: "ArrowLeft", keyCode: 37 });
  await waitFor(() =>
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "1 / 2",
    ),
  );
  expect(
    document.querySelector("[data-artifact-preview-caption]")?.textContent,
  ).toBe("An original caption");
  expect(
    document.querySelector("[data-artifact-preview-caption] h2"),
  ).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Next image" }));
  await waitFor(() =>
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "2 / 2",
    ),
  );
  fireEvent.keyDown(window, { key: "Escape", keyCode: 27 });
  // JSDOM does not dispatch CSS animation completion, including at 0ms.
  fireEvent.animationEnd(
    document.querySelector(".PhotoView-Slider__Backdrop")!,
  );
  await waitFor(() =>
    expect(document.querySelector(".PhotoView-Portal")).toBeNull(),
  );
  expect(document.activeElement).toBe(second);
});

it("provides a viewer for an image rendered outside a document provider", async () => {
  const view = render(
    <ZoomableImage src="/standalone.webp" alt="Diagram">
      <span>Diagram</span>
    </ZoomableImage>,
  );
  fireEvent.click(view.getByRole("button", { name: "Enlarge image: Diagram" }));
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Close image preview" }),
    ).toBeTruthy(),
  );
  expect(
    document.querySelector(".PhotoView-Portal img")?.getAttribute("src"),
  ).toBe("/standalone.webp");
});

it("pinches the actual image while preventing browser zoom", async () => {
  const view = render(
    <ZoomableImage src="/pinch.webp" alt="Pinch image" width={800} height={600}>
      <span>Pinch image</span>
    </ZoomableImage>,
  );
  fireEvent.click(
    view.getByRole("button", { name: "Enlarge image: Pinch image" }),
  );
  const image = await waitFor(() => {
    const image = document.querySelector('img[src="/pinch.webp"]');
    expect(image).toBeTruthy();
    return image!;
  });
  const box = image.closest<HTMLElement>(".PhotoView__PhotoBox")!;
  const initialWidth = parseFloat((image as HTMLElement).style.width);
  const displayedScale = () =>
    (Number(/^matrix\(([^,]+)/.exec(box.style.transform)?.[1]) *
      parseFloat((image as HTMLElement).style.width)) /
    initialWidth;
  const event = new WheelEvent("wheel", {
    ctrlKey: true,
    deltaY: -20,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(image, event);
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() => {
    const scale = displayedScale();
    expect(scale).toBeCloseTo(Math.exp(0.2));
  });
  const start = new Event("gesturestart", { bubbles: true, cancelable: true });
  fireEvent(image, start);
  const change = Object.assign(
    new Event("gesturechange", { bubbles: true, cancelable: true }),
    { scale: 2 },
  );
  fireEvent(image, change);
  expect(change.defaultPrevented).toBe(true);
  await waitFor(() => {
    const scale = displayedScale();
    expect(scale).toBeCloseTo(Math.exp(0.2) * 2);
  });
});
