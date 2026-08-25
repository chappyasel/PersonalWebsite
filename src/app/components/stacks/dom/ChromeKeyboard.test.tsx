// @vitest-environment jsdom
import { scenePerformanceController } from "../scene/scenePerformance";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChromeKeyboard from "./ChromeKeyboard";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition: _transition,
      ...props
    }: React.ComponentPropsWithoutRef<"div"> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <div
        data-motion-initial={JSON.stringify(initial)}
        data-motion-animate={JSON.stringify(animate)}
        data-motion-exit={JSON.stringify(exit)}
        {...props}
      >
        {children}
      </div>
    ),
  },
  useReducedMotion: () => false,
}));

vi.mock("~/lib/useTapFirstCapability", () => ({
  useTapFirstCapability: () => false,
}));

afterEach(() => {
  cleanup();
  scenePerformanceController.reset();
});

describe("ChromeKeyboard", () => {
  it("keeps the backdrop-filter surface outside the scene chrome compositor", () => {
    const { container } = render(
      <div data-test-scene-chrome style={{ filter: "blur(0px)" }}>
        <ChromeKeyboard open onOpenChange={vi.fn()} />
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });

    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(dialog.closest("[data-test-scene-chrome]")).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.getAttribute("data-motion-initial")).toContain('"opacity":0');
    expect(dialog.getAttribute("data-motion-animate")).toContain('"opacity":1');
    expect(dialog.getAttribute("data-motion-exit")).toContain('"opacity":0');
    expect(
      dialog
        .closest("[data-stacks-glass-mode]")
        ?.getAttribute("data-stacks-glass-mode"),
    ).toBe("native");
  });

  it("follows the live placard-material diagnostic", () => {
    render(<ChromeKeyboard open onOpenChange={vi.fn()} />);

    act(() => {
      scenePerformanceController.update({ placardGlassMode: "paper" });
    });

    expect(
      screen
        .getByRole("dialog", { name: "Keyboard shortcuts" })
        .closest("[data-stacks-glass-mode]")
        ?.getAttribute("data-stacks-glass-mode"),
    ).toBe("paper");
  });
});
