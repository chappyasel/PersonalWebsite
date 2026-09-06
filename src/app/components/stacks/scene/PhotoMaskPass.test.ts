import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhotoMaskPass } from "./PhotoMaskPass";
import {
  PHOTO_MASK_SCALE,
  photographMeshes,
  registerPhotograph,
} from "./photoMaskLayer";

type Seen = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  target: unknown;
  autoClear: boolean;
  clearColor: number;
  clearAlpha: number;
  drawn: Array<{ geometry: THREE.BufferGeometry; matrixWorld: number[] }>;
};

/** The renderer surface the pass touches, recording what it sees at the
 * moment of the draw so the test can tell "during" from "after". */
function fakeRenderer() {
  const clearColor = new THREE.Color(0x123456);
  let clearAlpha = 0.75;
  const seen: Seen[] = [];
  const renderer = {
    autoClear: true,
    target: null as unknown,
    seen,
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn<
      (color: THREE.ColorRepresentation, alpha?: number) => void
    >((color, alpha = 1) => {
      clearColor.set(color);
      clearAlpha = alpha;
    }),
    setRenderTarget: vi.fn((target: unknown) => {
      renderer.target = target;
    }),
    clear: vi.fn(),
    render: vi.fn((scene: THREE.Scene, camera: THREE.Camera) => {
      const drawn: Seen["drawn"] = [];
      scene.traverseVisible((object) => {
        if ((object as THREE.Mesh).isMesh)
          drawn.push({
            geometry: (object as THREE.Mesh).geometry,
            matrixWorld: object.matrixWorld.toArray(),
          });
      });
      seen.push({
        scene,
        camera,
        target: renderer.target,
        autoClear: renderer.autoClear,
        clearColor: clearColor.getHex(),
        clearAlpha,
        drawn,
      });
    }),
    clearColorHex: () => clearColor.getHex(),
    clearAlphaValue: () => clearAlpha,
  };
  return renderer;
}

const releases: Array<() => void> = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
});

/** A photograph mesh mounted somewhere in the room, registered as LitImage
 * would register it. */
function mountPhotograph(room: THREE.Scene, x = 0) {
  const holder = new THREE.Group();
  holder.position.set(x, 1, -3);
  const photograph = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7));
  holder.add(photograph);
  room.add(photograph.parent!);
  room.updateMatrixWorld(true);
  releases.push(registerPhotograph(photograph));
  return photograph;
}

function setup() {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x336699);
  room.overrideMaterial = null;
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(5);
  const pass = new PhotoMaskPass(camera);
  const renderer = fakeRenderer();
  return { room, camera, pass, renderer };
}

describe("PhotoMaskPass", () => {
  it("draws its own scene of proxies through the room's camera, never the room", () => {
    const { room, camera, pass, renderer } = setup();
    const photograph = mountPhotograph(room, 0.4);
    pass.render(renderer as unknown as THREE.WebGLRenderer);

    expect(renderer.seen).toHaveLength(1);
    const draw = renderer.seen[0]!;
    expect(draw.scene).not.toBe(room);
    expect(draw.scene).toBe(pass.maskScene);
    expect(draw.camera).toBe(camera);
    expect(draw.drawn).toHaveLength(1);
    // Same geometry object, same world matrix: the proxy is the photograph's
    // silhouette exactly where the room drew it this frame.
    expect(draw.drawn[0]!.geometry).toBe(photograph.geometry);
    expect(draw.drawn[0]!.matrixWorld).toEqual(
      photograph.matrixWorld.toArray(),
    );
    const proxy = draw.scene.children[0] as THREE.Mesh;
    const material = proxy.material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.color.getHex()).toBe(0xffffff);
    // Fog would fade the white with distance and turn a yes/no mask grey.
    expect(material.fog).toBe(false);
  });

  it("leaves the room's camera and scene exactly as they were", () => {
    const { room, camera, pass, renderer } = setup();
    mountPhotograph(room);
    const layersBefore = camera.layers.mask;
    const background = room.background;
    pass.render(renderer as unknown as THREE.WebGLRenderer);

    expect(camera.layers.mask).toBe(layersBefore);
    expect(room.background).toBe(background);
    expect(room.overrideMaterial).toBeNull();
  });

  it("clears its own target and puts the renderer back afterwards", () => {
    const { room, pass, renderer } = setup();
    mountPhotograph(room);
    pass.render(renderer as unknown as THREE.WebGLRenderer);

    const draw = renderer.seen[0]!;
    expect(draw.target).toBe(pass.target);
    // The composer leaves autoClear off, so the pass clears for itself:
    // colour and depth, never a stencil it does not have.
    expect(draw.autoClear).toBe(false);
    expect(renderer.clear).toHaveBeenCalledWith(true, true, false);
    expect(draw.clearColor).toBe(0x000000);
    expect(draw.clearAlpha).toBe(0);

    expect(renderer.autoClear).toBe(true);
    expect(renderer.clearColorHex()).toBe(0x123456);
    expect(renderer.clearAlphaValue()).toBe(0.75);
  });

  it("follows the registry: photographs come and go, proxies with them", () => {
    const { room, pass, renderer } = setup();
    const gl = renderer as unknown as THREE.WebGLRenderer;
    const first = mountPhotograph(room, -1);
    pass.render(gl);
    expect(pass.proxyCount).toBe(1);

    const second = mountPhotograph(room, 1);
    pass.render(gl);
    expect(pass.proxyCount).toBe(2);
    expect(renderer.seen[1]!.drawn).toHaveLength(2);

    // Unmount the first: LitImage runs the release its registration returned.
    const release = releases.shift()!;
    release();
    pass.render(gl);
    expect(pass.proxyCount).toBe(1);
    expect(renderer.seen[2]!.drawn[0]!.geometry).toBe(second.geometry);
    expect(photographMeshes().has(first)).toBe(false);
  });

  it("hides a proxy while the photograph or any ancestor is hidden, or detached", () => {
    const { room, pass, renderer } = setup();
    const gl = renderer as unknown as THREE.WebGLRenderer;
    const photograph = mountPhotograph(room);

    photograph.parent!.visible = false;
    pass.render(gl);
    expect(renderer.seen[0]!.drawn).toHaveLength(0);

    photograph.parent!.visible = true;
    photograph.visible = false;
    pass.render(gl);
    expect(renderer.seen[1]!.drawn).toHaveLength(0);

    photograph.visible = true;
    pass.render(gl);
    expect(renderer.seen[2]!.drawn).toHaveLength(1);

    room.remove(photograph.parent!);
    pass.render(gl);
    expect(renderer.seen[3]!.drawn).toHaveLength(0);
  });

  it("tracks the photograph's world matrix frame by frame", () => {
    const { room, pass, renderer } = setup();
    const gl = renderer as unknown as THREE.WebGLRenderer;
    const photograph = mountPhotograph(room);
    pass.render(gl);
    photograph.parent!.position.x += 2;
    room.updateMatrixWorld(true);
    pass.render(gl);
    expect(renderer.seen[1]!.drawn[0]!.matrixWorld).toEqual(
      photograph.matrixWorld.toArray(),
    );
    expect(renderer.seen[1]!.drawn[0]!.matrixWorld).not.toEqual(
      renderer.seen[0]!.drawn[0]!.matrixWorld,
    );
  });

  it("does not swap the composer's buffers", () => {
    const { pass } = setup();
    expect(pass.needsSwap).toBe(false);
  });

  it("asks the composer for its depth texture and keeps what it is handed", () => {
    const { pass } = setup();
    // The grade must not ask with the depth attribute (postprocessing sorts
    // a merged pass by attribute and would run it before tone mapping), so
    // the pass asks instead and the composer hands the texture to it.
    expect(pass.needsDepthTexture).toBe(true);
    expect(pass.sceneDepth).toBeNull();
    const depth = new THREE.DepthTexture(4, 4);
    pass.setDepthTexture(depth);
    expect(pass.sceneDepth).toBe(depth);
  });

  it("keeps the mask at half the composer's size and resizes only on change", () => {
    const { pass } = setup();
    const resize = vi.spyOn(pass.target, "setSize");
    const mask = pass.mask;
    const depth = pass.depth;

    pass.setSize(2000, 1000);
    expect(pass.target.width).toBe(2000 * PHOTO_MASK_SCALE);
    expect(pass.target.height).toBe(1000 * PHOTO_MASK_SCALE);
    expect(resize).toHaveBeenCalledTimes(1);

    // The composer re-adds every pass whenever its children change and calls
    // setSize each time; an unchanged size must not rebuild the target.
    pass.setSize(2000, 1000);
    expect(resize).toHaveBeenCalledTimes(1);

    // The grade holds these two as uniforms once. A resize may reallocate
    // their storage but must hand back the same objects.
    expect(pass.mask).toBe(mask);
    expect(pass.depth).toBe(depth);
    expect(depth).toBeInstanceOf(THREE.DepthTexture);
    expect(pass.target.depthTexture).toBe(depth);
  });

  it("never sizes the mask to nothing", () => {
    const { pass } = setup();
    pass.setSize(1, 1);
    expect(pass.target.width).toBe(1);
    expect(pass.target.height).toBe(1);
  });

  it("disposes its target and drops its proxies with the pass", () => {
    const { room, pass, renderer } = setup();
    mountPhotograph(room);
    pass.render(renderer as unknown as THREE.WebGLRenderer);
    const dispose = vi.spyOn(pass.target, "dispose");
    pass.dispose();
    expect(dispose).toHaveBeenCalled();
    expect(pass.proxyCount).toBe(0);
    expect(pass.maskScene.children).toHaveLength(0);
  });
});
