// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { PhotoSlider } from "react-photo-view";
import { afterEach, expect, it } from "vitest";

import { usePhotoViewerChrome } from "./usePhotoViewerChrome";

function Host() {
  usePhotoViewerChrome();
  return <div />;
}

afterEach(() => {
  cleanup();
  document
    .querySelectorAll(".PhotoView-Portal")
    .forEach((node) => node.remove());
});

it("keeps chrome hidden through the photo viewer's closing animation", async () => {
  const { unmount } = render(<Host />);
  const portal = document.createElement("div");
  portal.className = "PhotoView-Portal";
  await act(async () => {
    document.body.append(portal);
  });
  expect(document.documentElement.dataset.photoView).toBe("open");

  await act(async () => {
    portal.classList.add("PhotoView-Slider__willClose");
  });
  expect(document.documentElement.dataset.photoView).toBe("closing");
  await act(async () => {
    portal.remove();
  });
  expect(document.documentElement.hasAttribute("data-photo-view")).toBe(false);

  await act(async () => {
    document.body.append(portal);
  });
  unmount();
  expect(document.documentElement.hasAttribute("data-photo-view")).toBe(false);
});

it("detects an existing viewer and keeps another open viewer in control", async () => {
  const closing = document.createElement("div");
  closing.className = "PhotoView-Portal PhotoView-Slider__willClose";
  document.body.append(closing);
  render(<Host />);
  expect(document.documentElement.dataset.photoView).toBe("closing");
  const open = document.createElement("div");
  open.className = "PhotoView-Portal";
  await act(async () => {
    document.body.append(open);
  });
  expect(document.documentElement.dataset.photoView).toBe("open");
  await act(async () => {
    open.remove();
  });
  expect(document.documentElement.dataset.photoView).toBe("closing");
});

it("does not rewrite root state for unrelated content updates", async () => {
  const { container } = render(<Host />);
  const changes: MutationRecord[] = [];
  const observer = new MutationObserver((records) => changes.push(...records));
  observer.observe(document.documentElement, { attributes: true });
  await act(async () => {
    container.append(document.createElement("span"));
    document.body.append(document.createElement("aside"));
  });
  observer.disconnect();
  document.body.querySelector("aside")!.remove();
  expect(changes).toEqual([]);
});

it("follows the real PhotoSlider portal lifecycle", async () => {
  function Viewer({ visible }: { visible: boolean }) {
    usePhotoViewerChrome();
    return (
      <PhotoSlider
        images={[{ key: "photo", src: "/photo.webp" }]}
        visible={visible}
        onClose={() => undefined}
      />
    );
  }
  const view = render(<Viewer visible />);
  await waitFor(() => {
    expect(document.documentElement.dataset.photoView).toBe("open");
  });
  expect(document.querySelector(".PhotoView-Portal")?.parentElement).toBe(
    document.body,
  );
  view.rerender(<Viewer visible={false} />);
  await waitFor(() => {
    expect(document.documentElement.dataset.photoView).toBe("closing");
  });
  // JSDOM does not emit the CSS animation's completion event.
  fireEvent.animationEnd(
    document.querySelector(".PhotoView-Slider__Backdrop")!,
  );
  await waitFor(() => {
    expect(document.documentElement.hasAttribute("data-photo-view")).toBe(
      false,
    );
  });
});
