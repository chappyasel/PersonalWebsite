// @vitest-environment jsdom
import {
  type WorldBootEvent,
  type WorldBootState,
  type WorldBootView,
  initialWorldBootState,
  reduceWorldBoot,
  worldBootView,
} from "../boot/worldBootMachine";
import { WORLD_BOOT_POLICY as P } from "../boot/worldBootPolicy";
import type { WorldBootScopedSignal } from "../boot/worldBootSession";
import type { StacksData } from "../data";
import { act, cleanup, render } from "@testing-library/react";
import {
  BoxGeometry,
  type Camera,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import SceneHandoff from "./SceneHandoff";
import { handoffCamera } from "./handoffCamera";
import { illustrationInteraction } from "./illustrationInteraction";
import type * as RegistrationModule from "./registration";
import { type RegisteredShelf, ShelfNotMountedError } from "./registration";

type Frame = { callback: () => void; priority: number };
type SceneRendered = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
) => void;

const harness = vi.hoisted(() => ({
  frames: new Set<Frame>(),
  listeners: new Set<() => void>(),
  sent: [] as WorldBootEvent[],
  view: null as unknown as WorldBootView,
  three: null as unknown as {
    scene: Scene;
    camera: PerspectiveCamera;
    gl: { domElement: HTMLCanvasElement };
  },
  dispatch: (_event: WorldBootEvent): void => {
    throw new Error("Boot harness is not configured");
  },
  register: vi.fn<() => RegisteredShelf | Promise<RegisteredShelf>>(),
  now: 1_000,
}));

vi.mock("@react-three/fiber", async () => {
  const { useLayoutEffect, useRef } = await import("react");
  return {
    useThree: () => harness.three,
    useFrame: (callback: () => void, priority = 0) => {
      const latest = useRef(callback);
      latest.current = callback;
      useLayoutEffect(() => {
        const frame = { callback: () => latest.current(), priority };
        harness.frames.add(frame);
        return () => void harness.frames.delete(frame);
      }, [priority]);
    },
  };
});

vi.mock("../boot/worldBootSession", () => ({
  worldBoot: {
    getView: () => harness.view,
    subscribe: (listener: () => void) => {
      harness.listeners.add(listener);
      return () => void harness.listeners.delete(listener);
    },
    scope: () => {
      const epoch = harness.view.epoch;
      return {
        epoch,
        send: (signal: WorldBootScopedSignal) => {
          const event = { ...signal, epoch, at: harness.now } as WorldBootEvent;
          harness.sent.push(event);
          harness.dispatch(event);
          return harness.view;
        },
      };
    },
  },
}));

vi.mock("./registration", async (importOriginal) => {
  const { ShelfNotMountedError } =
    await importOriginal<typeof RegistrationModule>();
  return {
    ShelfNotMountedError,
    registerAboutShelf: () => harness.register(),
    registerCapturedShelf: () => harness.register(),
  };
});

const KEY = "about:reading-selection-1:light:390x844";
const NEXT_KEY = "about:reading-selection-2:light:390x844";
const data = {
  readingBooks: [],
  readingBookColors: {},
} as unknown as StacksData;
let state: WorldBootState;
let artwork: HTMLElement;
let retained: Mesh;
let outside: Mesh;
let hidden: Mesh;
let shelf: RegisteredShelf;
let ordinaryCamera: PerspectiveCamera;
let ordinaryMesh: Matrix4;
let priorSceneRender: SceneRendered;
let observers: TestResizeObserver[];

class TestResizeObserver implements ResizeObserver {
  readonly observed = new Set<Element>();
  readonly observe = vi.fn((target: Element) => {
    this.observed.add(target);
  });
  readonly unobserve = vi.fn((target: Element) => {
    this.observed.delete(target);
  });
  readonly disconnect = vi.fn(() => this.observed.clear());

  constructor(private readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }

  /** A queued notification may outlive the effect that observed the canvas. */
  deliverQueuedResize() {
    this.callback([], this);
  }
}

function notify() {
  for (const listener of harness.listeners) listener();
}

function dispatch(event: WorldBootEvent, publish = true) {
  state = reduceWorldBoot(state, event);
  harness.view = worldBootView(state);
  if (publish) notify();
}

function start(): Extract<WorldBootEvent, { type: "start" }> {
  return {
    type: "start",
    at: harness.now,
    origin: "hydrate",
    webglAvailable: true,
    prefersReducedMotion: false,
    saveData: false,
    ogCapture: false,
    illustratedMode: true,
    prepaintTimedOut: false,
    warm: { source: "documentPhase", phase: null },
  };
}

/** Frame preparation and the renderer callback are separate on purpose. */
async function frame(at = harness.now) {
  harness.now = at;
  await act(async () => {
    for (const entry of [...harness.frames].sort(
      (a, b) => a.priority - b.priority,
    ))
      entry.callback();
    await Promise.resolve();
  });
}

function sceneCallback() {
  // The callback is always invoked with its owning scene as `this` below.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return harness.three.scene.onAfterRender as SceneRendered;
}

function expectMatrix(actual: Matrix4, expected: Matrix4) {
  for (let index = 0; index < 16; index++)
    expect(actual.elements[index]).toBeCloseTo(expected.elements[index]!, 12);
}

function paint(
  camera: Camera = harness.three.camera,
  callback = sceneCallback(),
) {
  act(() => {
    callback.call(
      harness.three.scene,
      harness.three.gl as unknown as WebGLRenderer,
      harness.three.scene,
      camera,
    );
  });
}

function signals(type: WorldBootEvent["type"]) {
  return harness.sent.filter((event) => event.type === type);
}

async function prepare() {
  const mounted = render(<SceneHandoff data={data} />);
  await frame();
  expect(harness.register).toHaveBeenCalledOnce();
  await frame();
  return mounted;
}

async function dissolve() {
  const mounted = await prepare();
  paint();
  await frame();
  paint();
  expect(harness.view.presentation).toBe("dissolve");
  return mounted;
}

beforeEach(() => {
  illustrationInteraction.moving = false;
  harness.frames.clear();
  harness.listeners.clear();
  harness.sent = [];
  harness.now = 1_000;
  harness.register.mockReset();
  harness.dispatch = dispatch;
  observers = [];
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(performance, "now").mockImplementation(() => harness.now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 12,
    y: 80,
    width: 366,
    height: 260,
    top: 80,
    left: 12,
    right: 378,
    bottom: 340,
    toJSON: () => ({}),
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 390 / 844, 0.1, 1_000);
  camera.position.set(2, 1, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  ordinaryCamera = camera.clone();
  const unit = new Group();
  unit.name = "room-unit:0";
  retained = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  retained.position.set(0.4, -0.8, 0.2);
  outside = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  hidden = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  hidden.visible = false;
  unit.add(retained);
  scene.add(unit, outside, hidden);
  scene.updateMatrixWorld(true);
  ordinaryMesh = retained.matrixWorld.clone();
  priorSceneRender = vi.fn<SceneRendered>();
  scene.onAfterRender = priorSceneRender;
  harness.three = {
    scene,
    camera,
    gl: { domElement: document.createElement("canvas") },
  };
  const drawingCamera = new PerspectiveCamera(30, 1.4, 0.1, 1_000);
  drawingCamera.position.set(-2, 0.6, 5);
  drawingCamera.lookAt(0, 0, 0);
  drawingCamera.updateMatrixWorld(true);
  shelf = {
    world: drawingCamera.matrixWorld.clone(),
    projection: drawingCamera.projectionMatrix.clone(),
    meshes: new Map([[retained, new Matrix4().makeTranslation(0.3, -0.7, 0)]]),
    residuals: [{ id: "validated-shelf", px: 0 }],
  };
  harness.register.mockReturnValue(shelf);
  handoffCamera.aimError = 0;
  handoffCamera.targetX = 0;
  handoffCamera.frame = 1;
  Object.assign(handoffCamera, { scenePosition: 0 });
  handoffCamera.scrollError = 0;

  artwork = document.createElement("div");
  artwork.dataset.roomArtwork = "";
  artwork.dataset.artworkKey = KEY;
  artwork.dataset.unit = "0";
  artwork.dataset.theme = "light";
  document.body.append(artwork);
  state = initialWorldBootState();
  dispatch(start(), false);
  const epoch = state.epoch;
  dispatch({ type: "illustrationChanged", key: KEY, at: harness.now }, false);
  dispatch(
    {
      type: "assetLoad",
      epoch,
      at: harness.now,
      assets: {
        active: false,
        loaded: 10,
        total: 10,
        errors: 0,
      },
    },
    false,
  );
  dispatch({ type: "firstFrame", epoch, at: harness.now }, false);
  dispatch({ type: "meadowReady", epoch, at: harness.now }, false);
  harness.now += P.assetSettleMs;
  dispatch({ type: "tick", at: harness.now }, false);
});

afterEach(() => {
  cleanup();
  artwork.remove();
  for (const mesh of [retained, outside, hidden]) {
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("waits until the ordinary camera reaches the selected shelf before matching", async () => {
  Object.assign(handoffCamera, { scenePosition: 4 });
  render(<SceneHandoff data={data} />);
  await frame();
  expect(harness.register).not.toHaveBeenCalled();
  Object.assign(handoffCamera, { scenePosition: 0 });
  await frame(harness.now + 300);
  expect(harness.register).toHaveBeenCalledOnce();
});

it("requires the native scroll to reach the authored stop, including About's rail offset", async () => {
  handoffCamera.scrollError = 0.03;
  render(<SceneHandoff data={data} />);
  await frame();
  expect(harness.register).not.toHaveBeenCalled();
  handoffCamera.scrollError = 0;
  await frame(harness.now + 300);
  expect(harness.register).toHaveBeenCalledOnce();
});

it("waits for a zero-sized canvas to acquire layout before registering rendered frames", async () => {
  const canvas = harness.three.gl.domElement;
  const rectangle = vi
    .spyOn(canvas, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 0, 0));
  render(<SceneHandoff data={data} />);
  const observer = observers[0]!;
  expect(observer.observed).toEqual(new Set([canvas, artwork]));
  await frame();
  await frame();
  paint();
  expect(harness.register).not.toHaveBeenCalled();
  expect(harness.sent).toEqual([]);

  rectangle.mockReturnValue(new DOMRect(0, 0, 390, 844));
  act(() => observer.deliverQueuedResize());
  expect(observer.disconnect).toHaveBeenCalledOnce();
  await frame();
  await frame();
  paint();
  expect(signals("illustrationRegistered")).toEqual([]);
  // Once layout is valid, another queued resize cannot restart the match.
  act(() => observer.deliverQueuedResize());
  await frame();
  paint();
  expect(harness.register).toHaveBeenCalledOnce();
  expect(signals("illustrationRegistered")).toEqual([
    { type: "illustrationRegistered", key: KEY, epoch: 1, at: harness.now },
  ]);
});

it.each(["unmount", "key replacement"] as const)(
  "retires a pending canvas measurement on %s and rejects its queued callback",
  async (stop) => {
    const rectangle = vi
      .spyOn(harness.three.gl.domElement, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 0, 0));
    const mounted = render(<SceneHandoff data={data} />);
    const oldObserver = observers[0]!;
    if (stop === "unmount") mounted.unmount();
    else {
      artwork.dataset.artworkKey = NEXT_KEY;
      act(() =>
        dispatch({
          type: "illustrationChanged",
          key: NEXT_KEY,
          at: harness.now,
        }),
      );
    }
    expect(oldObserver.disconnect).toHaveBeenCalledOnce();
    expect(oldObserver.observed.size).toBe(0);
    const callsBeforeLateDelivery = rectangle.mock.calls.length;
    rectangle.mockReturnValue(new DOMRect(0, 0, 390, 844));
    act(() => oldObserver.deliverQueuedResize());
    expect(rectangle).toHaveBeenCalledTimes(callsBeforeLateDelivery);
    await frame();
    paint();
    expect(harness.register).not.toHaveBeenCalled();
    expect(harness.sent).toEqual([]);
    expectMatrix(harness.three.camera.matrixWorld, ordinaryCamera.matrixWorld);

    if (stop === "key replacement") {
      act(() => observers[1]!.deliverQueuedResize());
      await frame();
      await frame();
      paint();
      await frame();
      paint();
      expect(signals("illustrationRegistered")).toEqual([
        {
          type: "illustrationRegistered",
          key: NEXT_KEY,
          epoch: 1,
          at: harness.now,
        },
      ]);
    }
  },
);

it("registers only after two distinct rendered frames from the owned camera", async () => {
  render(<SceneHandoff data={data} />);
  paint();
  await frame();
  await frame();
  expect(signals("illustrationRegistered")).toEqual([]);
  paint(new PerspectiveCamera());
  paint();
  paint();
  expect(signals("illustrationRegistered")).toEqual([]);
  await frame();
  await frame();
  expect(signals("illustrationRegistered")).toEqual([]);
  paint();
  paint();
  expect(signals("illustrationRegistered")).toEqual([
    { type: "illustrationRegistered", key: KEY, epoch: 1, at: harness.now },
  ]);
  expect(harness.view).toMatchObject({
    presentation: "dissolve",
    revealed: false,
  });
  expect(priorSceneRender).toHaveBeenCalledTimes(6);
});

it("retries an unfinished prop mount at the existing pace before registering its rendered frames", async () => {
  harness.register.mockRejectedValueOnce(
    new ShelfNotMountedError("Missing saved mesh: prop"),
  );
  render(<SceneHandoff data={data} />);
  const firstAttempt = harness.now;
  const deadline = harness.view.deadlineAt;
  await frame();
  paint();
  expect(harness.register).toHaveBeenCalledOnce();
  expect(harness.sent).toEqual([]);
  expect(harness.view).toMatchObject({
    status: "booting",
    presentation: "illustrated",
    worldMounted: true,
    revealed: false,
    deadlineAt: deadline,
  });
  expectMatrix(harness.three.camera.matrixWorld, ordinaryCamera.matrixWorld);

  await frame(firstAttempt + 249);
  expect(harness.register).toHaveBeenCalledOnce();
  await frame(firstAttempt + 250);
  expect(harness.register).toHaveBeenCalledTimes(2);
  expect(harness.sent).toEqual([]);
  await frame();
  paint();
  expect(signals("illustrationRegistered")).toEqual([]);
  await frame();
  paint();
  expect(signals("illustrationUnavailable")).toEqual([]);
  expect(signals("illustrationRegistered")).toHaveLength(1);
  expect(harness.view.presentation).toBe("dissolve");
});

it("keeps the overall boot deadline when a prop never mounts", async () => {
  harness.register.mockRejectedValue(
    new ShelfNotMountedError("Missing saved mesh: prop"),
  );
  render(<SceneHandoff data={data} />);
  const deadline = harness.view.deadlineAt!;
  await frame();
  await frame(harness.now + 250);
  expect(harness.register).toHaveBeenCalledTimes(2);
  expect(harness.view.deadlineAt).toBe(deadline);
  act(() => dispatch({ type: "tick", at: deadline }));
  expect(harness.view).toMatchObject({
    status: "failed",
    failure: "hang",
    presentation: "illustrated",
    worldMounted: false,
    revealed: false,
  });
  expect(signals("illustrationUnavailable")).toEqual([]);
});

it.each([
  "Saved mesh identity changed: prop",
  "Shelf registration exceeds 3px (8.00px)",
])(
  "immediately retains the illustration for a fatal registration failure: %s",
  async (message) => {
    harness.register.mockRejectedValue(new Error(message));
    render(<SceneHandoff data={data} />);
    await frame();
    expect(harness.register).toHaveBeenCalledOnce();
    expect(signals("illustrationUnavailable")).toEqual([
      { type: "illustrationUnavailable", key: KEY, epoch: 1, at: harness.now },
    ]);
    expect(harness.view).toMatchObject({
      status: "illustrated",
      worldMounted: false,
      revealed: false,
    });
    expect(state.matchUnavailable).toBe(true);
    expectMatrix(harness.three.camera.matrixWorld, ordinaryCamera.matrixWorld);
  },
);

it.each(["key", "epoch"] as const)(
  "rejects an old renderer callback when the %s changes before React commits",
  async (change) => {
    await prepare();
    paint();
    await frame();
    const oldRender = sceneCallback();
    // A session update is observable by callbacks before its React commit.
    if (change === "key")
      dispatch(
        { type: "illustrationChanged", key: NEXT_KEY, at: harness.now },
        false,
      );
    else dispatch(start(), false);
    paint(harness.three.camera, oldRender);
    expect(signals("illustrationRegistered")).toEqual([]);
    expect(signals("illustrationTravelCompleted")).toEqual([]);
    act(notify);
  },
);

it("discards pending registration after the selected data key is replaced", async () => {
  let finish!: (value: RegisteredShelf) => void;
  harness.register.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<SceneHandoff data={data} />);
  await frame();
  artwork.dataset.artworkKey = NEXT_KEY;
  act(() =>
    dispatch({ type: "illustrationChanged", key: NEXT_KEY, at: harness.now }),
  );
  await act(async () => finish(shelf));
  expectMatrix(harness.three.camera.matrixWorld, ordinaryCamera.matrixWorld);
  paint();
  expect(harness.sent).toEqual([]);

  await frame(harness.now + 250);
  await frame();
  paint();
  await frame();
  paint();
  expect(signals("illustrationRegistered")).toEqual([
    {
      type: "illustrationRegistered",
      key: NEXT_KEY,
      epoch: 1,
      at: harness.now,
    },
  ]);
});

it("keeps a prepared match when unrelated data gets a new object identity", async () => {
  const mounted = await prepare();
  paint();
  mounted.rerender(<SceneHandoff data={{ ...data }} />);
  expectMatrix(harness.three.camera.matrixWorld, shelf.world);
  await frame();
  paint();
  expect(harness.register).toHaveBeenCalledOnce();
  expect(signals("illustrationRegistered")).toHaveLength(1);
});

it("dissolves in place and reports completion only after the ordinary pose paints", async () => {
  shelf.world.copy(ordinaryCamera.matrixWorld);
  shelf.projection.copy(ordinaryCamera.projectionMatrix);
  await dissolve();
  const started = harness.view.handoffStartedAt!;
  harness.now = started + P.illustrationTravelDelayMs - 1;
  act(() => dispatch({ type: "tick", at: harness.now }));
  await frame();
  expectMatrix(harness.three.camera.matrixWorld, shelf.world);
  expect(harness.view.revealed).toBe(false);
  expect(outside.visible).toBe(true);
  expect(hidden.visible).toBe(false);

  harness.now = started + P.illustrationTravelDelayMs;
  act(() => dispatch({ type: "tick", at: harness.now }));
  await frame();
  expect(harness.view.presentation).toBe("travel");
  const arrival = harness.now;
  expect(harness.three.camera.position.toArray()).toEqual(
    ordinaryCamera.position.toArray(),
  );
  expect(harness.three.camera.projectionMatrix.elements).toEqual(
    ordinaryCamera.projectionMatrix.elements,
  );
  expect(harness.view.revealed).toBe(false);
  paint(new PerspectiveCamera());
  expect(signals("illustrationTravelCompleted")).toEqual([]);
  paint();
  expect(signals("illustrationTravelCompleted")).toEqual([
    { type: "illustrationTravelCompleted", key: KEY, epoch: 1, at: arrival },
  ]);
  expect(harness.view).toMatchObject({ presentation: "live", revealed: true });
});

it("rejects a paint acknowledgement when a gesture starts before React commits", async () => {
  await dissolve();
  harness.now = harness.view.handoffStartedAt! + P.illustrationTravelDelayMs;
  act(() => dispatch({ type: "tick", at: harness.now }));
  await frame();
  illustrationInteraction.moving = true;
  paint();
  expect(signals("illustrationTravelCompleted")).toEqual([]);
  expect(harness.view.revealed).toBe(false);
});

it.each(["unmount", "motion off"] as const)(
  "restores camera, mesh transforms and visibility on %s",
  async (stop) => {
    const mounted = await prepare();
    expectMatrix(harness.three.camera.matrixWorld, shelf.world);
    expect(retained.matrixWorld.equals(shelf.meshes.get(retained)!)).toBe(true);
    expect(retained.matrixWorldAutoUpdate).toBe(false);
    expect(outside.visible).toBe(false);
    if (stop === "unmount") mounted.unmount();
    else
      act(() =>
        dispatch({
          type: "illustrationMotionChanged",
          enabled: false,
          at: harness.now,
        }),
      );
    expectMatrix(harness.three.camera.matrixWorld, ordinaryCamera.matrixWorld);
    expect(
      harness.three.camera.projectionMatrix.equals(
        ordinaryCamera.projectionMatrix,
      ),
    ).toBe(true);
    expect(retained.matrixWorld.equals(ordinaryMesh)).toBe(true);
    expect(retained.matrixWorldAutoUpdate).toBe(true);
    expect(outside.visible).toBe(true);
    expect(hidden.visible).toBe(false);
    expect(sceneCallback()).toBe(priorSceneRender);
    expect(harness.frames.size).toBe(0);
  },
);

it("does no frame or registration work when illustration motion starts disabled", async () => {
  dispatch(
    { type: "illustrationMotionChanged", enabled: false, at: harness.now },
    false,
  );
  render(<SceneHandoff data={data} />);
  await frame();
  paint();
  expect(harness.frames.size).toBe(0);
  expect(observers).toEqual([]);
  expect(harness.register).not.toHaveBeenCalled();
  expect(harness.sent).toEqual([]);
});
