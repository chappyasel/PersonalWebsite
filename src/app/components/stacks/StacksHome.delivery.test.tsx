// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import StacksHome from "./StacksHome";
import type { StacksData, StacksSlots } from "./data";
import { useStacks } from "./store";

const mocks = vi.hoisted(() => ({
  view: {
    epoch: 1,
    mode: "world",
    revealed: true,
    worldMounted: true,
    canvasVisible: true,
    flatMounted: false,
    presentation: "live",
    status: "live",
    loadPath: "cold",
    startedAt: 0,
    canRequest3D: false,
  },
  send: vi.fn(),
  mounts: 0,
}));
vi.mock("./boot/useWorldBoot", () => ({ useWorldBoot: () => mocks.view }));
vi.mock("./boot/worldBootSession", () => ({
  worldBoot: {
    send: mocks.send,
    scope: () => ({ send: mocks.send }),
    getView: () => mocks.view,
    subscribe: () => () => undefined,
    getState: () => ({ illustratedMode: true }),
    request3D: vi.fn(),
  },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("~/lib/analytics", () => ({ captureOnce: vi.fn() }));
vi.mock(import("./room/ResidentRoomHost"), async (importOriginal) => ({
  ...(await importOriginal()),
  useRoomActive: () => true,
}));
vi.mock("./dom/ChromeLayer", () => ({
  default: () => null,
  ChromeSceneControls: () => null,
}));
vi.mock("./dom/UnitRail", () => ({ default: () => null }));
vi.mock("./dom/VisionRideControls", () => ({ default: () => null }));
vi.mock("./input/ScrollBridges", () => ({ default: () => null }));
vi.mock("./illustration/RoomDocument", () => ({
  default: () => <div data-testid="document" />,
}));
vi.mock("./modal/StacksBookModal", () => ({ default: () => null }));
vi.mock("./illustration/IllustratedRoom", () => ({
  default: () => <div data-testid="drawing" />,
}));
vi.mock("./dom/PlacardLayer", async () => {
  const { useEffect } = await import("react");
  return {
    default: function Reader() {
      useEffect(() => {
        mocks.mounts++;
      }, []);
      return (
        <div className="placard-scroll" data-testid="reader">
          <input aria-label="Reader state" defaultValue="original" />
          <button>Continue reading</button>
        </div>
      );
    },
  };
});
// The HUD's drift profile reads matchMedia on first render, and jsdom does
// not implement it. Desktop, and never reduced motion, so the component picks
// the same branch the assertions below were written against.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !query.includes("reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the actual panel owner mounted with reader state and scroll intact after GPU failure", () => {
  const initial = useStacks.getState();
  history.replaceState(null, "", "/#books");
  useStacks.setState({
    activeUnit: 1,
    settledUnit: null,
    seated: false,
    panelState: "open",
    scrollEl: null,
    jumpTo: null,
    travelTo: null,
  });
  mocks.mounts = 0;
  const data = { bookStats: { total: 1 } } as StacksData;
  const slots = {} as StacksSlots;
  try {
    const view = render(<StacksHome data={data} slots={slots} />);
    const reader = view.getByTestId("reader");
    const input = view.getByLabelText("Reader state") as HTMLInputElement;
    reader.scrollTop = 184;
    input.focus();
    input.value = "still reading";
    mocks.view = {
      ...mocks.view,
      presentation: "illustrated",
      status: "failed",
      worldMounted: false,
      canvasVisible: false,
      revealed: false,
    };
    view.rerender(<StacksHome data={data} slots={slots} />);
    expect(view.getByTestId("reader")).toBe(reader);
    expect(reader.scrollTop).toBe(184);
    expect(input.value).toBe("still reading");
    expect(document.activeElement).toBe(input);
    expect(mocks.mounts).toBe(1);
    expect(useStacks.getState().panelState).toBe("open");
    expect(useStacks.getState().activeUnit).toBe(1);
    expect(view.queryByTestId("document")).toBeNull();
    act(() => {
      view
        .getByRole("button", { name: "Continue reading" })
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(mocks.send).not.toHaveBeenCalledWith({
      type: "illustrationInteracted",
    });
    mocks.view = { ...mocks.view, presentation: "travel", worldMounted: true };
    view.rerender(<StacksHome data={data} slots={slots} />);
    expect(view.getByTestId("reader")).toBe(reader);
    expect(reader.closest("[inert]")).toBeNull();
    expect(reader.scrollTop).toBe(184);
    expect(document.activeElement).toBe(input);
    expect(mocks.mounts).toBe(1);
  } finally {
    cleanup();
    useStacks.setState(initial);
  }
});
