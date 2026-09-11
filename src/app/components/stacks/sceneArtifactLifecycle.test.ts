import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerArtifactPreviewFrame,
  resetArtifactPreviewFramesForTests,
} from "./scene/artifactPreviewFrames";
import { setInteractionProjectionContext } from "./scene/interactionProjection";
import { registerSceneInteraction } from "./scene/interactionRegistry";
import {
  beginSceneArtifactPreviewOriginSession,
  closeSceneArtifact,
  ensureSceneArtifactPreviewOrigin,
  imageRatioPreviewOrigin,
  readSceneArtifactPreviewOriginSession,
  sceneArtifactPreviewOriginSessionMatchesViewport,
  selectSceneArtifact,
  stageSceneArtifactPreviewReturnOrigin,
} from "./sceneArtifactState";
import { useStacks } from "./store";

const viewport = {
  left: 0,
  top: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

function photoRoot(x: number) {
  const root = new Group();
  root.position.x = x;
  root.add(new Mesh(new BoxGeometry(1, 1, 0.05), new MeshBasicMaterial()));
  root.updateMatrixWorld(true);
  return root;
}

function stubWindow(width = 100, height = 100) {
  vi.stubGlobal("window", {
    innerWidth: width,
    innerHeight: height,
    history: {
      state: null,
      back: vi.fn(),
      replaceState: vi.fn(),
    },
    location: { href: "https://example.com/" },
  });
}

describe("scene artifact lifecycle", () => {
  it("centers an image-ratio origin inside a projected card", () => {
    expect(
      imageRatioPreviewOrigin(
        { left: 10, top: 20, width: 160, height: 120 },
        16,
        9,
      ),
    ).toEqual({ left: 10, top: 35, width: 160, height: 90 });

    expect(
      imageRatioPreviewOrigin(
        { left: 10, top: 20, width: 160, height: 120 },
        3,
        4,
      ),
    ).toEqual({ left: 45, top: 20, width: 90, height: 120 });
  });

  beforeEach(() => {
    useStacks.setState({
      inspectedArtifact: null,
      modelArtifactHandoff: null,
      modalOpen: false,
    });
  });

  afterEach(() => {
    setInteractionProjectionContext(null, null);
    resetArtifactPreviewFramesForTests();
    vi.unstubAllGlobals();
  });

  it("keeps the room frozen until an image return animation finishes", () => {
    const state = useStacks.getState();
    state.openSceneArtifact("portrait");
    expect(useStacks.getState().modelArtifactHandoff).toMatchObject({
      artifactId: "portrait",
      phase: "lifting",
    });

    state.dispatchModelArtifactHandoff({
      type: "preview-ready",
      target: {
        bounds: { left: 10, top: 10, width: 80, height: 80 },
        sourceBounds: { left: 20, top: 20, width: 20, height: 20 },
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
    state.dispatchModelArtifactHandoff({ type: "source-crossfade-point" });
    state.dispatchModelArtifactHandoff({ type: "source-at-target" });
    state.dispatchModelArtifactHandoff({ type: "source-hidden" });
    state.closeSceneArtifact();

    expect(useStacks.getState()).toMatchObject({
      inspectedArtifact: null,
      modalOpen: true,
      modelArtifactHandoff: { phase: "returning" },
    });

    useStacks.getState().finishSceneArtifactClose();
    expect(useStacks.getState().modalOpen).toBe(true);

    useStacks.getState().dispatchModelArtifactHandoff({ type: "source-home" });
    expect(useStacks.getState()).toMatchObject({
      modelArtifactHandoff: null,
      modalOpen: false,
    });
  });

  it("changes carousel images without restarting the scene handoff", () => {
    const state = useStacks.getState();
    state.openSceneArtifact("portrait");
    state.dispatchModelArtifactHandoff({
      type: "preview-ready",
      target: {
        bounds: { left: 10, top: 10, width: 80, height: 80 },
        sourceBounds: { left: 20, top: 20, width: 20, height: 20 },
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
    state.dispatchModelArtifactHandoff({ type: "source-crossfade-point" });
    state.dispatchModelArtifactHandoff({ type: "source-at-target" });
    state.dispatchModelArtifactHandoff({ type: "source-hidden" });

    useStacks.getState().selectImageSceneArtifact("about-family-v8");

    expect(useStacks.getState()).toMatchObject({
      inspectedArtifact: "about-family-v8",
      modelArtifactHandoff: {
        artifactId: "about-family-v8",
        phase: "inspecting",
        target: null,
      },
    });

    useStacks.getState().dispatchModelArtifactHandoff({
      type: "preview-ready",
      target: {
        bounds: { left: 10, top: 10, width: 80, height: 80 },
        sourceBounds: { left: 70, top: 20, width: 20, height: 20 },
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
    useStacks.getState().closeSceneArtifact();
    expect(useStacks.getState()).toMatchObject({
      inspectedArtifact: null,
      modelArtifactHandoff: {
        artifactId: "about-family-v8",
        phase: "returning",
      },
    });
  });

  it("snapshots a distinct live origin for every photo in the collection", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);

    const releasePortrait = registerSceneInteraction({
      id: "grab:photo:portrait",
      root: photoRoot(-1),
      activeUnits: [0],
    });
    const releaseFamily = registerSceneInteraction({
      id: "grab:photo:about-family-v8",
      root: photoRoot(1),
      activeUnits: [0],
    });

    beginSceneArtifactPreviewOriginSession("portrait");
    const session = readSceneArtifactPreviewOriginSession();
    const portrait = session?.origins.get("portrait");
    const family = session?.origins.get("about-family-v8");
    expect(portrait).toBeDefined();
    expect(family).toBeDefined();
    expect(portrait!.left).toBeLessThan(family!.left);
    expect(session).toMatchObject({
      collection: "about-photos",
      viewport: { width: 100, height: 100 },
    });

    releasePortrait();
    releaseFamily();
    beginSceneArtifactPreviewOriginSession("portrait");
    expect(readSceneArtifactPreviewOriginSession()?.origins.size).toBe(0);
  });

  it("keeps a settled shelf destination separate from the hover-lifted origin", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);
    const release = registerSceneInteraction({
      id: "grab:photo:portrait",
      root: photoRoot(-1),
      activeUnits: [0],
    });
    const settled = {
      left: 62,
      top: 64,
      width: 18,
      height: 18,
      quad: [
        [62, 64],
        [80, 64],
        [80, 82],
        [62, 82],
      ],
    } as const;
    stageSceneArtifactPreviewReturnOrigin("portrait", settled);

    beginSceneArtifactPreviewOriginSession("portrait");
    const session = readSceneArtifactPreviewOriginSession();
    expect(session?.origins.get("portrait")?.left).not.toBe(settled.left);
    expect(session?.returnOrigins.get("portrait")).toMatchObject(settled);
    release();
  });

  it("keeps the board origin after the live photo moves into preview", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);

    const root = photoRoot(-1);
    const release = registerSceneInteraction({
      id: "grab:photo:portrait",
      root,
      activeUnits: [0],
    });
    beginSceneArtifactPreviewOriginSession("portrait");
    const boardBounds =
      readSceneArtifactPreviewOriginSession()?.origins.get("portrait");
    expect(boardBounds).toBeDefined();

    const state = useStacks.getState();
    state.openSceneArtifact("portrait");
    state.dispatchModelArtifactHandoff({
      type: "preview-ready",
      target: {
        bounds: { left: 10, top: 10, width: 80, height: 80 },
        sourceBounds: boardBounds!,
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
    root.position.set(0, 0, 2);
    root.scale.setScalar(10);
    root.updateMatrixWorld(true);

    closeSceneArtifact();

    expect(
      readSceneArtifactPreviewOriginSession()?.origins.get("portrait"),
    ).toBe(boardBounds);
    expect(
      useStacks.getState().modelArtifactHandoff?.target?.sourceBounds,
    ).toEqual(boardBounds);
    release();
  });

  it("measures only a missing carousel destination before selecting it", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);

    const portraitRoot = photoRoot(-1);
    const releasePortrait = registerSceneInteraction({
      id: "grab:photo:portrait",
      root: portraitRoot,
      activeUnits: [0],
    });
    beginSceneArtifactPreviewOriginSession("portrait");
    const portraitBounds =
      readSceneArtifactPreviewOriginSession()?.origins.get("portrait");
    expect(portraitBounds).toBeDefined();
    expect(
      readSceneArtifactPreviewOriginSession()?.origins.has("about-family-v8"),
    ).toBe(false);

    portraitRoot.position.set(0, 0, 2);
    portraitRoot.scale.setScalar(10);
    portraitRoot.updateMatrixWorld(true);
    const familyRoot = photoRoot(1);
    const releaseFamily = registerSceneInteraction({
      id: "grab:photo:about-family-v8",
      root: familyRoot,
      activeUnits: [0],
    });
    useStacks.getState().openSceneArtifact("portrait");
    selectSceneArtifact("about-family-v8");

    const session = readSceneArtifactPreviewOriginSession();
    const familyBounds = session?.origins.get("about-family-v8");
    expect(session?.origins.get("portrait")).toEqual(portraitBounds);
    expect(familyBounds).toBeDefined();
    expect(familyBounds!.left).toBeGreaterThan(portraitBounds!.left);
    expect(useStacks.getState().inspectedArtifact).toBe("about-family-v8");

    useStacks.getState().dispatchModelArtifactHandoff({
      type: "preview-ready",
      target: {
        bounds: { left: 10, top: 10, width: 80, height: 80 },
        sourceBounds: familyBounds!,
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
    closeSceneArtifact();
    expect(
      useStacks.getState().modelArtifactHandoff?.target?.sourceBounds,
    ).toEqual(familyBounds);

    releasePortrait();
    releaseFamily();
  });

  it("rejects preserved origins after the viewport changes", () => {
    stubWindow(390, 844);
    beginSceneArtifactPreviewOriginSession("portrait");
    const session = readSceneArtifactPreviewOriginSession();

    expect(
      sceneArtifactPreviewOriginSessionMatchesViewport(session, {
        width: 390,
        height: 844,
      }),
    ).toBe(true);
    expect(
      sceneArtifactPreviewOriginSessionMatchesViewport(session, {
        width: 844,
        height: 390,
      }),
    ).toBe(false);
  });

  it("does not replace an origin that was already captured", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);
    const root = photoRoot(-1);
    const release = registerSceneInteraction({
      id: "grab:photo:portrait",
      root,
      activeUnits: [0],
    });
    beginSceneArtifactPreviewOriginSession("portrait");
    const origin =
      readSceneArtifactPreviewOriginSession()?.origins.get("portrait");
    root.position.x = 2;
    root.scale.setScalar(8);
    root.updateMatrixWorld(true);

    ensureSceneArtifactPreviewOrigin("portrait");

    expect(
      readSceneArtifactPreviewOriginSession()?.origins.get("portrait"),
    ).toEqual(origin);
    release();
  });

  it("captures the print's projected face alongside the axis-aligned origin", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);
    const root = photoRoot(-1);
    root.rotation.z = 0.2;
    root.updateMatrixWorld(true);
    const release = registerSceneInteraction({
      id: "grab:photo:portrait",
      root,
      activeUnits: [0],
    });

    beginSceneArtifactPreviewOriginSession("portrait");
    const origin =
      readSceneArtifactPreviewOriginSession()?.origins.get("portrait");
    expect(origin?.quad).toHaveLength(4);
    const [topLeft, topRight] = origin!.quad!;
    // The roll survives into the quad: the top edge is not horizontal.
    expect(Math.abs(topRight[1] - topLeft[1])).toBeGreaterThan(1);
    for (const [x, y] of origin!.quad!) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
    release();
  });

  it("starts the morph from a box with the registered FRAMED aspect", () => {
    stubWindow();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => viewport,
    } as HTMLElement);
    const root = photoRoot(-1);
    const release = registerSceneInteraction({
      id: "grab:photo:about-family-v8",
      root,
      activeUnits: [0],
    });
    // The family photo is 769x1024. Its desk frame's 0.024 border on a
    // 0.198-wide plane widens the framed aspect to about 0.789.
    const releaseFrame = registerArtifactPreviewFrame("about-family-v8", {
      image: { width: 0.198, height: 0.264 },
      layers: [
        { inset: 0.006, tone: "pages", radius: 0 },
        { inset: 0.024, tone: "frame", radius: 0.005 },
      ],
    });

    beginSceneArtifactPreviewOriginSession("about-family-v8");
    const origin =
      readSceneArtifactPreviewOriginSession()?.origins.get("about-family-v8");
    expect(origin).toBeDefined();
    expect(origin!.width / origin!.height).toBeCloseTo(
      (769 + 2 * 0.024 * (769 / 0.198)) / (1024 + 2 * 0.024 * (769 / 0.198)),
      6,
    );
    expect(origin!.width / origin!.height).not.toBeCloseTo(769 / 1024, 3);

    releaseFrame();
    release();
  });
});
