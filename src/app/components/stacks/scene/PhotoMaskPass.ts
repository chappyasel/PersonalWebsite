import { Pass } from "postprocessing";
import * as THREE from "three";

import { PHOTO_MASK_SCALE, photographMeshes } from "./photoMaskLayer";

/**
 * Draws the photographs, and nothing else, into a small target the print
 * grade reads to leave their chroma alone (photoMaskLayer.ts).
 *
 * The room's scene is never rendered here. The pass keeps a private scene of
 * proxy meshes, one per registered photograph, each sharing the photograph's
 * geometry and copying its world matrix every frame, all in one flat white
 * material. Drawing that scene through the room's camera gives the mask
 * without touching the room's lights, fog, background, override material or
 * camera layers, so nothing the room renders can change because this pass
 * exists. Fifteen or so quads at half resolution: the cost is the clear.
 *
 * Occlusion is not solved by the draw: a prop standing in front of a print
 * has no proxy, so the mask would still say "photograph" beneath it. The
 * target therefore keeps its own depth texture, and the grade compares that
 * depth with the composer's: the mask counts only where the photograph is
 * the nearest surface.
 *
 * The pass writes nowhere the composer reads, so it does not swap buffers.
 * It goes first in the chain, right behind the render pass, when every
 * photograph's world matrix is current for the frame.
 */
export class PhotoMaskPass extends Pass {
  readonly target: THREE.WebGLRenderTarget;
  /** The composer's own depth texture, once it exists. The grade compares
   * the mask's depth against it. Asking for it here, rather than with the
   * depth attribute on the grade, matters: postprocessing sorts a merged
   * pass's effects by attribute, and a depth-attributed grade would run
   * before tone mapping. */
  sceneDepth: THREE.Texture | null = null;
  private readonly white: THREE.MeshBasicMaterial;
  private readonly proxies = new Map<THREE.Mesh, THREE.Mesh>();
  private readonly savedClearColor = new THREE.Color();

  constructor(camera: THREE.Camera) {
    super("PhotoMaskPass", new THREE.Scene(), camera);
    this.needsSwap = false;
    // Makes the composer create its depth texture if no other pass has, and
    // hand it to every pass through setDepthTexture.
    this.needsDepthTexture = true;
    this.scene.matrixWorldAutoUpdate = false;
    const depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    depthTexture.name = "PhotoMaskPass.depth";
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
    });
    this.target.texture.name = "PhotoMaskPass.mask";
    this.white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  }

  /** 1 where a photograph was drawn, 0 elsewhere. */
  get mask(): THREE.Texture {
    return this.target.texture;
  }

  /** How deep that photograph is, in the same encoding as the composer's
   * depth buffer, so the grade can tell a print from a prop in front of it. */
  get depth(): THREE.DepthTexture {
    return this.target.depthTexture!;
  }

  /** The proxies, for tests and diagnostics. */
  get proxyCount(): number {
    return this.proxies.size;
  }

  /** The private scene the proxies live in; the room's scene is never drawn. */
  get maskScene(): THREE.Scene {
    return this.scene;
  }

  override setDepthTexture(depthTexture: THREE.Texture) {
    this.sceneDepth = depthTexture;
  }

  override setSize(width: number, height: number) {
    const w = Math.max(1, Math.ceil(width * PHOTO_MASK_SCALE));
    const h = Math.max(1, Math.ceil(height * PHOTO_MASK_SCALE));
    if (this.target.width !== w || this.target.height !== h)
      this.target.setSize(w, h);
  }

  /** Mirror the registry: one proxy per photograph, sharing its geometry and
   * wearing its world matrix as of this frame's main render. */
  private sync() {
    const live = photographMeshes();
    for (const [photograph, proxy] of this.proxies) {
      if (live.has(photograph)) continue;
      this.scene.remove(proxy);
      this.proxies.delete(photograph);
    }
    for (const photograph of live) {
      let proxy = this.proxies.get(photograph);
      if (!proxy) {
        proxy = new THREE.Mesh(photograph.geometry, this.white);
        proxy.matrixAutoUpdate = false;
        proxy.matrixWorldAutoUpdate = false;
        this.proxies.set(photograph, proxy);
        this.scene.add(proxy);
      }
      proxy.geometry = photograph.geometry;
      proxy.visible = attachedAndVisible(photograph);
      proxy.matrixWorld.copy(photograph.matrixWorld);
    }
  }

  override render(renderer: THREE.WebGLRenderer) {
    this.sync();
    const autoClear = renderer.autoClear;
    renderer.getClearColor(this.savedClearColor);
    const clearAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);

    renderer.setClearColor(this.savedClearColor, clearAlpha);
    renderer.autoClear = autoClear;
  }

  override dispose() {
    for (const proxy of this.proxies.values()) this.scene.remove(proxy);
    this.proxies.clear();
    super.dispose();
  }
}

/** Three hides a subtree when any ancestor is invisible, and a detached mesh
 * is not drawn at all; the proxy has to follow both. */
function attachedAndVisible(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    if ((node as THREE.Scene).isScene) return true;
    node = node.parent;
  }
  return false;
}
