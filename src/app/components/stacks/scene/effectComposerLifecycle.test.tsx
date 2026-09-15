// @vitest-environment jsdom
import { EffectComposer as SourceEffectComposer } from "../../../../../node_modules/@react-three/postprocessing/src/EffectComposer";
import { context as FiberContext, type RootState } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { act, cleanup, render as renderReact } from "@testing-library/react";
import {
  type EffectComposer as Composer,
  Effect,
  type EffectPass,
  Pass,
} from "postprocessing";
import { type ReactNode, createRef } from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

const harness = {
  state: {} as Record<string, unknown>,
  nodes: [] as unknown[],
};

function render(element: ReactNode) {
  const store = create<RootState>(() => harness.state as unknown as RootState);
  return renderReact(element, {
    wrapper: ({ children }) => (
      <FiberContext.Provider value={store}>{children}</FiberContext.Provider>
    ),
  });
}

// Only the R3F host graph is substituted. The installed React composer,
// postprocessing passes, effects, depth textures and disposal are real.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "__r3f", {
    configurable: true,
    get: () => ({ children: harness.nodes.map((object) => ({ object })) }),
  });
  harness.state = {
    internal: { subscribe: () => () => undefined },
    camera: new THREE.PerspectiveCamera(),
    scene: new THREE.Scene(),
    size: { width: 1440, height: 900 },
    gl: {
      autoClear: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      getSize: (target: THREE.Vector2) => target.set(1440, 900),
      getDrawingBufferSize: (target: THREE.Vector2) => target.set(2880, 1800),
      getContext: () => ({ getContextAttributes: () => ({ alpha: false }) }),
      setSize: vi.fn(),
    },
  };
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "__r3f");
});

function depthEffect() {
  return new Effect(
    "DepthReader",
    "void mainImage(const in vec4 c, const in vec2 uv, const in float depth, out vec4 o) { o = c; }",
    { attributes: 1 },
  );
}

describe.each([
  ["public package entry", EffectComposer],
  ["package source", SourceEffectComposer],
])("the installed composer's resource lifetime (%s)", (_, EffectComposer) => {
  it("keeps passes and shared depth when only child props change", () => {
    const effect = depthEffect();
    harness.nodes = [effect];
    const ref = createRef<Composer>();
    const view = render(
      <EffectComposer ref={ref}>
        <group name="unit-0" />
      </EffectComposer>,
    );
    const composer = ref.current!;
    const pass = composer.passes[1] as EffectPass;
    const depth = pass.getDepthTexture();
    const disposed = vi.fn();
    depth.addEventListener("dispose", disposed);
    const initialize = vi.spyOn(effect, "initialize");

    view.rerender(
      <EffectComposer ref={ref}>
        <group name="unit-6" />
      </EffectComposer>,
    );

    expect(composer.passes[1]).toBe(pass);
    expect((composer.passes[1] as EffectPass).getDepthTexture()).toBe(depth);
    expect(disposed).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("releases replaced pass materials without disposing retained effects", () => {
    const effect = depthEffect();
    harness.nodes = [effect];
    const ref = createRef<Composer>();
    const view = render(
      <EffectComposer ref={ref}>
        <group />
      </EffectComposer>,
    );
    const previous = ref.current!.passes[1] as EffectPass;
    const materialDispose = vi.spyOn(previous.fullscreenMaterial, "dispose");
    const effectDispose = vi.spyOn(effect, "dispose");
    harness.nodes = [
      effect,
      new Effect(
        "Finish",
        "void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) { o = c; }",
      ),
    ];

    view.rerender(
      <EffectComposer ref={ref}>
        <group name="changed-chain" />
      </EffectComposer>,
    );

    expect(materialDispose).toHaveBeenCalledOnce();
    expect(effectDispose).not.toHaveBeenCalled();
    const retiredVersion = previous.fullscreenMaterial.version;
    act(() => effect.dispatchEvent({ type: "change" }));
    // Retired merged passes must no longer listen to live effects.
    expect(previous.fullscreenMaterial.version).toBe(retiredVersion);
  });

  it("preserves React-owned passes when composer settings change", () => {
    const pass = new Pass("ReactOwnedPass");
    harness.nodes = [pass, depthEffect()];
    const dispose = vi.spyOn(pass, "dispose");
    const ref = createRef<Composer>();
    const view = render(
      <EffectComposer ref={ref} multisampling={0}>
        <group />
      </EffectComposer>,
    );
    const previous = ref.current;

    view.rerender(
      <EffectComposer ref={ref} multisampling={8}>
        <group />
      </EffectComposer>,
    );

    expect(ref.current).not.toBe(previous);
    expect(ref.current!.passes).toContain(pass);
    expect(dispose).not.toHaveBeenCalled();
  });
});
