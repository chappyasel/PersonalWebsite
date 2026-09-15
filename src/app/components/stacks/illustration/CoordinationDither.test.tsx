// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CoordinationDither } from "./CoordinationDither";
import { coordinationDitherController } from "./coordinationDitherControl";
import {
  COORDINATION_DITHER_FRAMES,
  coordinationDitherPath,
} from "./coordinationDitherGeometry";

let reduced = false;
let changeMotion: () => void;
beforeEach(() => {
  reduced = false;
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, listener: () => void) => {
      changeMotion = listener;
    },
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  coordinationDitherController.setEffectEnabled(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("sends only one compact static path on first paint, even when opted in", () => {
  const markup = renderToStaticMarkup(
    <svg>
      <CoordinationDither active />
    </svg>,
  );
  expect(markup.match(/<path/g)).toHaveLength(1);
  expect(markup).not.toContain("animated");
  expect(markup.length).toBeLessThan(4000);
});
it("uses distinct cached pixel frames without animation-frame callbacks", () => {
  const raf = vi.spyOn(window, "requestAnimationFrame");
  const { container, rerender } = render(
    <svg>
      <CoordinationDither active />
    </svg>,
  );
  const frames = [...container.querySelectorAll("path")].map((path) =>
    path.getAttribute("d"),
  );
  expect(frames).toHaveLength(COORDINATION_DITHER_FRAMES);
  expect(new Set(frames).size).toBeGreaterThan(4);
  expect(frames[0]).toBe(coordinationDitherPath());
  expect(raf).not.toHaveBeenCalled();
  rerender(
    <svg>
      <CoordinationDither />
    </svg>,
  );
  expect(container.querySelectorAll("path")).toHaveLength(1);
});
it("removes animated frames when disabled, hidden, or reduced motion is requested", () => {
  const { container } = render(
    <svg>
      <CoordinationDither active />
    </svg>,
  );
  const count = () => container.querySelectorAll("path").length;
  expect(count()).toBe(8);
  act(() => coordinationDitherController.setEffectEnabled(false));
  expect(count()).toBe(1);
  act(() => coordinationDitherController.setEffectEnabled(true));
  expect(count()).toBe(8);
  act(() => {
    reduced = true;
    changeMotion();
  });
  expect(count()).toBe(1);
  act(() => {
    reduced = false;
    changeMotion();
  });
  expect(count()).toBe(8);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(count()).toBe(1);
});
