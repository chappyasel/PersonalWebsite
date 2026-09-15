// @vitest-environment jsdom
import { desktopScrollViewportStyle } from "../dom/desktopScrollViewport";
import { act, cleanup, render } from "@testing-library/react";
import fs from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";

import HudCameraDrift from "./HudCameraDrift";
import { hudCameraDriftController } from "./hudCameraDriftControl";

const homeSource = fs.readFileSync(
  "src/app/components/stacks/StacksHome.tsx",
  "utf8",
);
const sidebarStyle =
  /\[data-stacks-desktop-dock\],\s*\[data-stacks-details-toggle-shell\]\s*\{([^}]+)\}/.exec(
    homeSource,
  )![1]!;

const runtime = vi.hoisted(() => ({
  canvas: null as HTMLCanvasElement | null,
  frames: new Set<(state: object, delta: number) => void>(),
  progress: { current: 0 },
  pointer: { x: 0, y: 0 },
  eligible: true,
  mobile: false,
  mediaListeners: new Set<() => void>(),
}));
vi.mock("@react-three/fiber", async () => {
  const { useEffect } = await import("react");
  return {
    useThree: (select: (state: object) => unknown) =>
      select({ gl: { domElement: runtime.canvas } }),
    useFrame: (callback: (state: object, delta: number) => void) => {
      useEffect(() => {
        runtime.frames.add(callback);
        return () => {
          runtime.frames.delete(callback);
        };
      }, [callback]);
    },
  };
});
vi.mock("../boot/worldBootSession", () => ({
  worldBoot: {
    subscribe: () => () => undefined,
    getView: () => ({ revealed: true, presentation: "live" }),
  },
}));
vi.mock("../store", () => ({
  progressRef: runtime.progress,
  useStacks: {
    getState: () => ({
      visionRideRoomHidden: false,
      modelArtifactHandoff: null,
    }),
  },
}));
vi.mock("./freeRoamDiagnostics", () => ({
  freeRoamDiagnosticsController: { getSnapshot: () => ({ enabled: false }) },
}));
vi.mock("./screenshotMode", () => ({
  screenshotModeController: { getSnapshot: () => ({ enabled: false }) },
}));

beforeEach(() => {
  runtime.progress.current = 0;
  runtime.pointer.x = 0;
  runtime.pointer.y = 0;
  runtime.eligible = true;
  runtime.mobile = false;
  hudCameraDriftController.setEnabled(true);
  hudCameraDriftController.setMouseEnabled(false);
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return (
        runtime.eligible &&
        (query.startsWith("(width <") ? runtime.mobile : !runtime.mobile)
      );
    },
    addEventListener: (_: string, callback: () => void) =>
      runtime.mediaListeners.add(callback),
    removeEventListener: (_: string, callback: () => void) =>
      runtime.mediaListeners.delete(callback),
  }));
});
afterEach(() => {
  cleanup();
  desktopMotionPreference.setReduced(false);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("removes the drift frame and restores HUD positions when the visitor reduces motion", () => {
  const { hud, dock } = mount();
  frame(0);
  frame(0.01);
  expect(hud.style.translate).not.toBe("");
  act(() => desktopMotionPreference.setReduced(true));
  expect(runtime.frames.size).toBe(0);
  expect(hud.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
  expect(hudCameraDriftController.getSnapshot().enabled).toBe(true);
  act(() => desktopMotionPreference.setReduced(false));
  expect(runtime.frames.size).toBe(1);
});

function mount() {
  const shell = document.createElement("div");
  shell.className = "stacks-world-shell";
  shell.innerHTML =
    '<canvas></canvas><nav class="stacks-hud-drift"></nav><aside data-stacks-desktop-dock></aside><div data-stacks-details-toggle-shell></div><div class="stacks-mobile-hud-drift"><button>Section</button></div><div class="stacks-mobile-hud-drift" data-test-mobile-controls><button>Sound</button></div><div data-stacks-mobile-sheet-drift><div data-stacks-sheet-material style="translate: 0 24px"></div></div><div data-stacks-mobile-sheet-drift><section data-stacks-mobile-panel style="transform: translateY(100px)"><div class="placard-scroll">Reading sheet</div></section></div>';
  document.body.append(shell);
  runtime.canvas = shell.querySelector("canvas");
  render(<HudCameraDrift />);
  return {
    shell,
    hud: shell.querySelector("nav")!,
    dock: shell.querySelector("aside")!,
    mobileHud: shell.querySelector<HTMLElement>(".stacks-mobile-hud-drift")!,
    mobileControls: shell.querySelector<HTMLElement>(
      "[data-test-mobile-controls]",
    )!,
    mobileSheet: shell.querySelector<HTMLElement>(
      "[data-stacks-mobile-panel]",
    )!,
    toggle: shell.querySelector<HTMLElement>(
      "[data-stacks-details-toggle-shell]",
    )!,
  };
}
function frame(progress: number, pointerX = 0, delta = 1 / 60, pointerY = 0) {
  act(() => {
    runtime.progress.current = progress;
    runtime.pointer.x = pointerX;
    runtime.pointer.y = pointerY;
    for (const callback of runtime.frames)
      callback({ pointer: runtime.pointer }, delta);
  });
}

it("moves mobile chrome and both sheet layers together within 20px without changing sheet gestures", () => {
  runtime.mobile = true;
  hudCameraDriftController.setMouseEnabled(true);
  const { shell, hud, dock, mobileHud, mobileControls, mobileSheet } = mount();
  const sheetCarriers = [
    ...shell.querySelectorAll<HTMLElement>("[data-stacks-mobile-sheet-drift]"),
  ];
  const material = shell.querySelector<HTMLElement>(
    "[data-stacks-sheet-material]",
  )!;
  const query = vi.spyOn(shell, "querySelectorAll");
  const bounds = vi.spyOn(mobileHud, "getBoundingClientRect");
  frame(0);
  for (let i = 1; i <= 90; i++) {
    frame(i / 180, 1, 1 / 60, -1);
    const [x, y] = mobileHud.style.translate.split(" ").map(Number.parseFloat);
    expect(Math.abs(x!)).toBeLessThanOrEqual(20);
    expect(y).toBe(0);
    expect(mobileControls.style.translate).toBe(mobileHud.style.translate);
    for (const carrier of sheetCarriers)
      expect(carrier.style.translate).toBe(mobileHud.style.translate);
  }
  expect(mobileHud.style.translate).toBe("-20px 0");
  expect(hud.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
  expect(mobileSheet.style.transform).toBe("translateY(100px)");
  expect(material.style.translate).toBe("0 24px");
  expect(mobileSheet.firstElementChild!.getAttribute("style")).toBeNull();
  expect(query).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled();
  for (let i = 0; i < 120; i++) frame(0.5, -1, 1 / 60, 1);
  expect(mobileHud.style.translate).toBe("");
  for (const carrier of sheetCarriers) expect(carrier.style.translate).toBe("");
  const write = vi.spyOn(mobileHud.style, "translate", "set");
  for (let i = 0; i < 20; i++) frame(0.5, i / 20);
  expect(write).not.toHaveBeenCalled();
  act(() => hudCameraDriftController.setEnabled(false));
  // Desktop mouse drift stays enabled, but must not leave a mobile frame running.
  expect(runtime.frames.size).toBe(0);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])(
  "holds moving mobile targets under the finger and resumes smoothly after %s",
  (releaseType) => {
    runtime.mobile = true;
    const { mobileHud, mobileSheet } = mount();
    // A press in the sheet pauses the same motion as a navigation press.
    const button =
      releaseType === "pointerup"
        ? mobileSheet.firstElementChild!
        : mobileHud.querySelector("button")!;
    const pointerEvent = (type: string, id: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: id, pointerType: "touch" });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    };
    frame(0);
    for (let i = 1; i <= 20; i++) frame(i / 300);
    const held = mobileHud.style.translate;
    pointerEvent("pointerdown", 1);
    pointerEvent("pointerdown", 2);
    for (let i = 21; i <= 60; i++) frame(i / 300);
    expect(mobileHud.style.translate).toBe(held);
    pointerEvent(releaseType, 1);
    frame(0.3);
    expect(mobileHud.style.translate).toBe(held);
    pointerEvent(releaseType, 2);
    frame(0.3);
    expect(
      Math.abs(parseFloat(mobileHud.style.translate) - parseFloat(held)),
    ).toBeLessThan(2);
    for (let i = 0; i < 120; i++) frame(0.3);
    expect(mobileHud.style.translate).toBe("");
  },
);

it("restores mobile targets on resize and removes all work for system reduced motion", () => {
  runtime.mobile = true;
  const { mobileHud, hud } = mount();
  frame(0);
  frame(0.01);
  expect(mobileHud.style.translate).not.toBe("");
  act(() => {
    runtime.mobile = false;
    for (const callback of runtime.mediaListeners) callback();
  });
  expect(mobileHud.style.translate).toBe("");
  frame(0.01);
  frame(0.02);
  expect(hud.style.translate).not.toBe("");
  act(() => {
    runtime.mobile = true;
    runtime.eligible = false;
    for (const callback of runtime.mediaListeners) callback();
  });
  expect(hud.style.translate).toBe("");
  expect(runtime.frames.size).toBe(0);
});

it("does no style work for mouse movement when mouse drift is disabled", () => {
  const { shell, hud } = mount();
  frame(0);
  const rootWrite = vi.spyOn(shell.style, "setProperty");
  const hudWrite = vi.spyOn(hud.style, "setProperty");
  for (let i = 0; i < 60; i++) frame(0, Math.sin(i) * 0.1);
  expect(rootWrite).not.toHaveBeenCalled();
  expect(hudWrite).not.toHaveBeenCalled();
  expect(hud.style.translate).toBe("");
});

it("shares one frame callback for both mouse axes and stops writes once settled", () => {
  hudCameraDriftController.setMouseEnabled(true);
  const { shell, hud, dock, toggle } = mount();
  const rootWrite = vi.spyOn(shell.style, "setProperty");
  const query = vi.spyOn(shell, "querySelectorAll");
  const write = vi.spyOn(hud.style, "translate", "set");
  expect(runtime.frames.size).toBe(1);
  for (let i = 0; i < 90; i++) frame(0, 0.5, 1 / 60, -0.5);
  expect(hud.style.translate).toBe("-6px -6px");
  expect(dock.style.transform).toBe("translate(-6px, -6px)");
  expect(toggle.style.transform).toBe(dock.style.transform);
  expect(write.mock.calls.length).toBeLessThanOrEqual(90);
  expect(rootWrite).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
  write.mockClear();
  for (let i = 0; i < 90; i++) frame(0, 0.5, 1 / 60, -0.5);
  expect(write).not.toHaveBeenCalled();
  act(() => hudCameraDriftController.setMouseEnabled(false));
  frame(0, 0.5, 1 / 60, -0.5);
  expect(hud.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
  expect(hudCameraDriftController.getSnapshot().enabled).toBe(true);
});

it("bounds combined travel and mouse motion, and removes work when both are off", () => {
  hudCameraDriftController.setMouseEnabled(true);
  const { hud, dock } = mount();
  frame(0);
  for (let i = 1; i <= 90; i++) {
    frame(i / 180, 1, 1 / 60, 1);
    const [x, y] = hud.style.translate.split(" ").map(Number.parseFloat);
    expect(Math.abs(x!)).toBeLessThanOrEqual(20);
    expect(Math.abs(y!)).toBeLessThanOrEqual(12);
  }
  expect(hud.style.translate).toBe("-20px 0");
  act(() => hudCameraDriftController.setEnabled(false));
  for (let i = 0; i < 90; i++) frame(0.5, -1, 1 / 60, -1);
  expect(runtime.frames.size).toBe(1);
  expect(hud.style.translate).toBe("12px -12px");
  act(() => hudCameraDriftController.setMouseEnabled(false));
  expect(runtime.frames.size).toBe(0);
  expect(hud.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
});

it("keeps both scrollport edges outside the screen throughout vertical mouse drift", () => {
  hudCameraDriftController.setMouseEnabled(true);
  const { hud } = mount();
  // Resolve only the fixed bleed in the actual scroller styles. Its 100%
  // still follows the viewport, and 5rem is the existing content padding.
  const extraHeight = Number(
    /\+ (\d+)px/.exec(desktopScrollViewportStyle.height)![1],
  );
  const extraTopPadding = Number(
    /\+ (\d+)px/.exec(desktopScrollViewportStyle.paddingTop)![1],
  );
  const extraBottomPadding = Number(
    /\+ (\d+)px/.exec(desktopScrollViewportStyle.paddingBottom)![1],
  );
  for (const pointerY of [1, -1]) {
    for (let i = 0; i < 90; i++) {
      frame(0, 0, 1 / 60, pointerY);
      const y = Number.parseFloat(hud.style.translate.split(" ")[1] ?? "0");
      for (const height of [600, 900, 1440]) {
        const top = desktopScrollViewportStyle.top + y;
        expect(top).toBeLessThanOrEqual(0);
        expect(top + height + extraHeight).toBeGreaterThanOrEqual(height);
      }
    }
  }
  // Extra padding cancels the bleed: initial card placement, centring space,
  // and scroll range remain exactly as they were before vertical drift.
  expect(desktopScrollViewportStyle.top + extraTopPadding).toBe(0);
  expect(extraHeight - extraTopPadding - extraBottomPadding).toBe(0);
});

it("moves the full HUD on traverse without changing inherited root styles, then settles", () => {
  const { shell, hud, dock } = mount();
  frame(0);
  const rootWrite = vi.spyOn(shell.style, "setProperty");
  const query = vi.spyOn(shell, "querySelectorAll");
  for (let i = 1; i <= 30; i++) frame(i / 300);
  expect(parseFloat(hud.style.translate)).toBeLessThan(0);
  expect(parseFloat(hud.style.translate)).toBeGreaterThanOrEqual(-20);
  expect(dock.style.transform).toBe(
    `translateX(${parseFloat(hud.style.translate)}px)`,
  );
  expect(rootWrite).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
  for (let i = 0; i < 120; i++) frame(0.1);
  expect(hud.style.translate).toBe("");
  expect(dock.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
  const restingStyle = vi.spyOn(hud.style, "translate", "set");
  for (let i = 0; i < 60; i++) frame(0.1, Math.sin(i) * 0.1);
  expect(restingStyle).not.toHaveBeenCalled();
});

it("moves newly mounted labels with the HUD and restores removed labels", async () => {
  const { shell, hud } = mount();
  frame(0);
  frame(0.01);
  const label = document.createElement("div");
  label.setAttribute("data-stacks-portal-label", "");
  await act(async () => {
    shell.append(label);
  });
  expect(label.style.translate).toBe(hud.style.translate);
  await act(async () => {
    label.remove();
  });
  expect(label.style.translate).toBe("");
});

it("does not feed frame-driven drift into the sidebar's animated hide/show property", () => {
  const { shell, hud, dock, toggle } = mount();
  const style = document.createElement("style");
  style.textContent = `[data-stacks-desktop-dock], [data-stacks-details-toggle-shell] { ${sidebarStyle} }`;
  shell.append(style);
  expect(getComputedStyle(dock).transition).toContain("translate 360ms");
  frame(0);
  for (let i = 1; i <= 12; i++) frame(i / 300);
  // The left HUD updates immediately. Feeding those updates to a 360ms
  // transition keeps restarting the right side before it can catch up.
  expect(dock.style.translate).toBe("");
  expect(dock.style.transform).toBe(
    `translateX(${parseFloat(hud.style.translate)}px)`,
  );
  expect(getComputedStyle(dock).transition).not.toMatch(/\b(transform|all)\b/);
  // Rapid reversals must reach both sides on every frame, with no second
  // easing clock on either the cards or their show/hide control.
  for (let i = 1; i <= 60; i++) {
    frame(0.1 + Math.sin(i * 0.5) * 0.02);
    const expected = hud.style.translate
      ? `translateX(${parseFloat(hud.style.translate)}px)`
      : "";
    expect(dock.style.transform).toBe(expected);
    expect(toggle.style.transform).toBe(expected);
    expect(dock.style.translate).toBe("");
    expect(toggle.style.translate).toBe("");
  }
  act(() => hudCameraDriftController.setEnabled(false));
  expect(dock.style.transform).toBe("");
  expect(toggle.style.transform).toBe("");
  expect(getComputedStyle(dock).transition).toContain("translate 360ms");
});

it("reverses with travel and avoids a kick when resuming after a long frame", () => {
  const { hud } = mount();
  frame(0.5);
  expect(hud.style.translate).toBe("");
  for (let i = 1; i <= 30; i++) frame(0.5 + i / 300);
  expect(parseFloat(hud.style.translate)).toBeLessThan(0);
  for (let i = 1; i <= 30; i++) frame(0.6 - i / 300);
  expect(parseFloat(hud.style.translate)).toBeGreaterThan(0);
  expect(parseFloat(hud.style.translate)).toBeLessThanOrEqual(20);
  const beforePause = parseFloat(hud.style.translate);
  frame(0.8, 0, 2);
  const afterPause = parseFloat(hud.style.translate);
  expect(Math.abs(afterPause - beforePause)).toBeLessThan(2);
  for (let i = 0; i < 120; i++) frame(0.8);
  expect(hud.style.translate).toBe("");
});

it("gives the same drift at 60Hz and 120Hz for the same travel speed", () => {
  const traverse = (hz: number) => {
    const { hud } = mount();
    frame(0);
    for (let i = 1; i <= hz / 4; i++) frame(i / (hz * 6), 0, 1 / hz);
    const offset = parseFloat(hud.style.translate);
    cleanup();
    return offset;
  };
  expect(traverse(60)).toBe(traverse(120));
});

it.each([1 / 30, 0.08, 0.12])(
  "keeps the HUD continuous through a %ss frame at a section boundary",
  (delta) => {
    const { hud, dock } = mount();
    frame(0);
    for (let i = 1; i <= 24; i++) frame(i / 300);
    const before = parseFloat(hud.style.translate);
    // Crossing progress 1/12 activates Books. Its content can delay a frame.
    frame(0.09, 0, delta);
    const during = parseFloat(hud.style.translate || "0");
    expect(Math.abs(during - before)).toBeLessThan(2);
    expect(dock.style.transform).toBe(
      `translateX(${parseFloat(hud.style.translate)}px)`,
    );
    frame(0.09 + 1 / 300);
    const after = parseFloat(hud.style.translate || "0");
    expect(Math.abs(after - during)).toBeLessThan(1);
  },
);

it("preserves the drift through a zero-delta repaint and still settles at low frame rates", () => {
  const { hud } = mount();
  frame(0);
  for (let i = 1; i <= 24; i++) frame(i / 300);
  const before = hud.style.translate;
  frame(0.08, 0, 0);
  expect(hud.style.translate).toBe(before);
  for (let i = 0; i < 60; i++) frame(0.08, 0, 0.12);
  expect(hud.style.translate).toBe("");
});

it("clears translations and removes frame work when disabled or reduced motion is requested", () => {
  const { hud } = mount();
  frame(0);
  frame(0.01);
  act(() => hudCameraDriftController.setEnabled(false));
  expect(runtime.frames.size).toBe(0);
  expect(hud.style.translate).toBe("");
  act(() => hudCameraDriftController.setEnabled(true));
  frame(0.01);
  frame(0.02);
  act(() => {
    runtime.eligible = false;
    for (const callback of runtime.mediaListeners) callback();
  });
  expect(runtime.frames.size).toBe(0);
  expect(hud.style.translate).toBe("");
});
