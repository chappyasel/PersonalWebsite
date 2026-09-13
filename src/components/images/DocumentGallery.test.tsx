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

import { DocumentGallery, ZoomableImage } from "./DocumentGallery";
import { artifactPreviewVisualEffects } from "~/app/components/stacks/scene/artifactPreviewVisualEffects";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => {
  cleanup();
  artifactPreviewVisualEffects.resetForTests();
  vi.unstubAllGlobals();
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
