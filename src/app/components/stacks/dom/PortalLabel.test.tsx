// @vitest-environment jsdom
import { interactionZoomTarget } from "../scene/cameraZoom";
import {
  destinationFor,
  projectPortal,
  registerSceneInteraction,
} from "../scene/interactionRegistry";
import type * as InteractionRegistry from "../scene/interactionRegistry";
import { selectOrActivateSceneInteraction } from "../scene/interactionSelection";
import { touchWorldRef, useStacks } from "../store";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { Group } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import PortalLabel from "./PortalLabel";

vi.mock("../scene/interactionRegistry", async (original) => ({
  ...(await original<typeof InteractionRegistry>()),
  projectPortal: vi.fn(() => ({ x: 300, y: 300, behind: false })),
}));
vi.mock("../fieldNotes/progress", () => ({ recordFieldNoteEvent: vi.fn() }));

let world: HTMLDivElement;
let release: () => void;
let run: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(projectPortal).mockReturnValue({ x: 300, y: 300, behind: false });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  touchWorldRef.interactionPointerType = "unknown";
  world = document.createElement("div");
  document.body.append(world);
  useStacks.setState({
    scrollEl: world,
    hovered: null,
    focusedInteraction: null,
    focusedInteractionAt: 0,
    dragging: null,
    modalOpen: false,
    panelState: "closed",
  });
  run = vi.fn();
  release = registerSceneInteraction({
    id: "test:link",
    root: new Group(),
    activeUnits: [0],
    activation: { kind: "portal", label: "Destination", external: true, run },
  });
});

afterEach(() => {
  cleanup();
  release();
  world.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  touchWorldRef.interactionPointerType = "unknown";
});

function settle() {
  for (let i = 0; i < 6; i++)
    act(() => {
      vi.advanceTimersByTime(100);
    });
}

function select() {
  act(() => useStacks.getState().setFocusedInteraction("test:link"));
  settle();
}

function pointer(target: EventTarget, type: string, properties = {}) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, {
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    ...properties,
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

function press(target: EventTarget) {
  pointer(target, "pointerdown");
}

it.each([
  ["weightlifting", "View site"],
  ["systems", "Read article"],
  ["books", "Browse book notes"],
  ["manual", "Read manual"],
  ["routine", "Read routine"],
  ["blog", "Browse articles"],
  ["liarsdice", "Play game"],
] as const)("shows a separate action line for %s", (destination, action) => {
  release();
  const target = destinationFor(destination);
  release = registerSceneInteraction({
    id: "test:link",
    root: new Group(),
    activeUnits: [0],
    activation: { kind: "portal", ...target, run },
  });
  render(<PortalLabel />);
  select();
  expect(screen.getByText(target.label)).toBeTruthy();
  expect(document.querySelector("[data-portal-action]")?.textContent).toBe(
    action,
  );
  expect(run).not.toHaveBeenCalled();
});

it.each([
  [undefined, null],
  ["View site", null],
  ["Read article", "Read article"],
] as const)(
  "omits redundant View site copy but retains specific actions: %s",
  (actionLabel, expected) => {
    release();
    release = registerSceneInteraction({
      id: "test:link",
      root: new Group(),
      activeUnits: [0],
      activation: {
        kind: "portal",
        label: "Organization",
        detail: ["Former engineer"],
        actionLabel,
        external: true,
        run,
      },
    });
    render(<PortalLabel />);
    select();
    expect(
      document.querySelector("[data-portal-action]")?.textContent ?? null,
    ).toBe(expected);
    expect(screen.getByText("Former engineer")).toBeTruthy();
  },
);

it("compresses the selected object on mouse press and releases without activating", () => {
  render(<PortalLabel />);
  select();
  act(() => useStacks.getState().setHovered("test:link"));
  press(world);
  expect(useStacks.getState().pressedInteraction).toBe("test:link");
  pointer(world, "pointerup");
  expect(useStacks.getState().pressedInteraction).toBeNull();
  expect(useStacks.getState().focusedInteraction).toBe("test:link");
  expect(run).not.toHaveBeenCalled();
});

it.each(["pointermove", "pointercancel", "lostpointercapture"])(
  "clears desktop compression on %s",
  (type) => {
    render(<PortalLabel />);
    act(() => useStacks.getState().setHovered("test:link"));
    press(world);
    pointer(world, type, { clientX: 30 });
    expect(useStacks.getState().pressedInteraction).toBeNull();
    expect(run).not.toHaveBeenCalled();
  },
);

it("keeps the selected preview visible while hover transfers or leaves the world", () => {
  render(<PortalLabel />);
  select();
  const label = document.querySelector<HTMLElement>(
    "[data-stacks-portal-label]",
  )!;
  expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("1");
  act(() => useStacks.getState().setHovered("another-object"));
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("1");
  settle();
  expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("1");
  act(() => useStacks.getState().setHovered(null));
  settle();
  expect(
    screen.getByRole("button", { name: "Destination View site" }),
  ).toBeTruthy();
  expect(run).not.toHaveBeenCalled();
});

it.each([null, { x: 300, y: 300, behind: true }])(
  "hides an unprojectable selected label instead of attaching it to the cursor: %s",
  (projection) => {
    render(<PortalLabel />);
    select();
    const label = document.querySelector<HTMLElement>(
      "[data-stacks-portal-label]",
    )!;
    const objectX = label.style.getPropertyValue("--portal-label-x");
    vi.mocked(projectPortal).mockReturnValue(projection);
    pointer(world, "pointermove", { clientX: 600, clientY: 500 });
    settle();
    expect(label.style.getPropertyValue("--portal-label-x")).toBe(objectX);
    expect(label.style.visibility).toBe("hidden");
    expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("0");

    vi.mocked(projectPortal).mockReturnValue({ x: 350, y: 300, behind: false });
    settle();
    expect(label.dataset.anchorSource).toBe("object");
    expect(label.style.getPropertyValue("--portal-label-x")).toBe("350px");
    expect(label.style.visibility).toBe("visible");
    expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("1");
  },
);

it("keeps a projected selection anchored while the cursor moves", () => {
  render(<PortalLabel />);
  select();
  const label = document.querySelector<HTMLElement>(
    "[data-stacks-portal-label]",
  )!;
  const objectX = label.style.getPropertyValue("--portal-label-x");
  pointer(world, "pointermove", { clientX: 600, clientY: 500 });
  settle();
  expect(label.style.getPropertyValue("--portal-label-x")).toBe(objectX);
  expect(label.dataset.anchorSource).toBe("object");
});

it("inherits the glass text color when hovering the selected action", async () => {
  render(<PortalLabel />);
  select();
  const button = screen.getByRole<HTMLButtonElement>("button", {
    name: "Destination View site",
  });
  const { root } = await postcss([
    tailwindcss({
      content: [{ raw: button.outerHTML, extension: "html" }],
      theme: { colors: { "accent-foreground": "#222222" } },
      corePlugins: { preflight: false },
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  // jsdom has no pointer-driven :hover state. Apply the compiled hover
  // rules via an attribute to exercise the actual rendered Button utilities.
  root.walkRules((rule) => {
    if (
      !rule.nodes.some((node) => node.type === "decl" && node.prop === "color")
    ) {
      rule.remove();
      return;
    }
    rule.selector = rule.selector.replace(/:hover\b/g, "[data-test-hover]");
  });
  root.walkDecls("color", (declaration) => {
    declaration.value = declaration.value.replace(
      "var(--tw-text-opacity)",
      "1",
    );
  });
  const style = document.createElement("style");
  style.textContent = `button { color: inherit; } ${root.toString()}`;
  document.head.append(style);
  button.parentElement!.style.color = "rgb(245, 245, 245)";
  button.setAttribute("data-test-hover", "");
  try {
    // jsdom leaves explicit inheritance unresolved in computed styles.
    const color = getComputedStyle(button).color;
    expect(
      color === "inherit"
        ? getComputedStyle(button.parentElement!).color
        : color,
    ).toBe("rgb(245, 245, 245)");
  } finally {
    style.remove();
  }
});

it("activates through the visible label without dismissing on its pointerdown", () => {
  render(<PortalLabel />);
  select();
  const button = screen.getByRole("button", { name: "Destination View site" });
  press(button);
  expect(useStacks.getState().focusedInteraction).toBe("test:link");
  fireEvent.click(button);
  expect(run).toHaveBeenCalledOnce();
});

it("dismisses on an empty-world press or Escape", () => {
  render(<PortalLabel />);
  select();
  press(world);
  expect(useStacks.getState().focusedInteraction).toBeNull();
  select();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(useStacks.getState().focusedInteraction).toBeNull();
  expect(useStacks.getState().hovered).toBeNull();
  expect(run).not.toHaveBeenCalled();
});

it("keeps selection zoom through the press and release of a different object", () => {
  const unregister = registerSceneInteraction({
    id: "test:next",
    root: new Group(),
    activeUnits: [0],
    activation: {
      kind: "portal",
      label: "Next destination",
      external: true,
      run,
    },
  });
  const zoomTargets: number[] = [];
  const unsubscribe = useStacks.subscribe((state) => {
    zoomTargets.push(
      interactionZoomTarget({
        distance: 8,
        focused: Boolean(state.focusedInteraction),
        pressed: Boolean(state.pressedInteraction),
        hovered: Boolean(state.hovered),
        dragging: false,
        traveling: false,
        blocked: false,
        touchInteraction: false,
      }),
    );
  });
  try {
    render(<PortalLabel />);
    select();
    zoomTargets.length = 0;
    act(() => useStacks.getState().setHovered("test:next"));
    press(world);
    // Pointerdown and release can span several camera frames. The old
    // selection must remain until the stationary gesture chooses the next.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    pointer(world, "pointerup");
    act(() => {
      selectOrActivateSceneInteraction("test:next");
    });
    expect(useStacks.getState().focusedInteraction).toBe("test:next");
    expect(zoomTargets.length).toBeGreaterThan(0);
    expect(Math.min(...zoomTargets)).toBeGreaterThan(0);
    expect(run).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
    unregister();
  }
});

it("preserves the old selection when a press on another object is cancelled", () => {
  render(<PortalLabel />);
  act(() => useStacks.getState().setFocusedInteraction("test:previous"));
  act(() => useStacks.getState().setHovered("test:link"));
  press(world);
  pointer(world, "pointercancel");
  expect(useStacks.getState().focusedInteraction).toBe("test:previous");
  expect(useStacks.getState().pressedInteraction).toBeNull();
  expect(run).not.toHaveBeenCalled();
});

it("does not make a hover-only label actionable", () => {
  render(<PortalLabel />);
  act(() => useStacks.getState().setHovered("test:link"));
  settle();
  const label = screen.getByRole("status");
  expect((label as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(label);
  expect(run).not.toHaveBeenCalled();
});

it("allows mouse hover on a device whose primary pointer is touch", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  touchWorldRef.interactionPointerType = "mouse";
  render(<PortalLabel />);
  act(() => useStacks.getState().setHovered("test:link"));
  settle();
  expect(screen.getByRole("status")).toBeTruthy();
  expect(useStacks.getState().focusedInteraction).toBeNull();
});

it("keeps visible hover text at full opacity while activation is disabled", async () => {
  render(<PortalLabel />);
  act(() => useStacks.getState().setHovered("test:link"));
  settle();
  const label = screen.getByRole<HTMLButtonElement>("status");
  const surface = label.closest<HTMLElement>("[data-stacks-portal-label]");
  expect(surface?.style.getPropertyValue("--portal-label-opacity")).toBe("1");
  expect(label.disabled).toBe(true);

  // Compile the rendered Button's utilities so this catches inherited disabled
  // styling as well as any overrides on the tooltip itself.
  const { css } = await postcss([
    tailwindcss({
      content: [{ raw: label.outerHTML, extension: "html" }],
      corePlugins: { preflight: false },
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  try {
    expect(Number(getComputedStyle(label).opacity || "1")).toBe(1);
  } finally {
    style.remove();
  }
});

it("uses serif action text even when controls default to sans-serif", async () => {
  render(<PortalLabel />);
  act(() => useStacks.getState().setHovered("test:link"));
  settle();
  const label = screen.getByRole<HTMLButtonElement>("status");
  const { css } = await postcss([
    tailwindcss({
      content: [{ raw: label.outerHTML, extension: "html" }],
      corePlugins: { preflight: false },
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  const style = document.createElement("style");
  style.textContent = `button { font-family: Arial, sans-serif; } ${css}`;
  document.head.append(style);
  try {
    expect(getComputedStyle(label).fontFamily).toMatch(/(?:^|,\s*)serif$/);
  } finally {
    style.remove();
  }
});
