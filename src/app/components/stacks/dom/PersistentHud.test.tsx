// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { registerOverlay } from "~/lib/overlays/coordinator";

import { PersistentHud } from "./PersistentHud";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the same HUD above overlays at its last header position through dismissal", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  let headerTop = 40;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      left: 150,
      top: headerTop,
      right: 318,
      bottom: headerTop + 48,
      width: 168,
      height: 48,
      x: 150,
      y: headerTop,
      toJSON: () => ({}),
    }),
  );
  const view = render(
    <div className="stacks-wordmark">
      <PersistentHud>
        <button>Performance readout</button>
      </PersistentHud>
    </div>,
  );
  const header = view.container.querySelector(".stacks-wordmark")!;
  const hud = document.querySelector<HTMLElement>(
    "[data-persistent-performance-hud]",
  )!;
  const button = hud.querySelector("button");
  expect(hud.parentElement).toBe(document.body);
  expect(header.contains(hud)).toBe(false);
  const initialTop = hud.style.top;
  let overlay: ReturnType<typeof registerOverlay> | undefined;
  try {
    act(() => {
      overlay = registerOverlay({ kind: "video", dismiss: vi.fn() });
    });
    expect(hud.hasAttribute("inert")).toBe(true);
    expect(hud.style.zIndex).toBe("var(--overlay-floating-layer, 5100)");
    headerTop = 28;
    act(() => {
      header.dispatchEvent(new Event("transitionend"));
    });
    expect(hud.style.top).toBe(initialTop);
    act(() => {
      overlay!.update("closing");
    });
    expect(hud.querySelector("button")).toBe(button);
    expect(hud.hasAttribute("inert")).toBe(true);
    act(() => {
      overlay!.release();
    });
    expect(hud.hasAttribute("inert")).toBe(false);
    headerTop = 60;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(hud.style.top).toContain("60px");
  } finally {
    act(() => {
      overlay?.release();
    });
  }
});
