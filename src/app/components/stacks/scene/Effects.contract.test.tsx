import type * as StacksStore from "../store";
import { ToneMappingMode } from "postprocessing";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The composer chain is what this module produces, so that is what these
// tests read. `@react-three/postprocessing` and `@react-three/fiber` are the
// two things Effects cannot run without and cannot run inside Node, so both
// are replaced with recording adapters. Everything else — the quality plan,
// the colour-grade store, the scene store, the Cinematic+ sun registry — is
// the real module.
//
// WHAT THIS FILE CANNOT PROVE. `renderToStaticMarkup` runs no effects and
// attaches no refs, so anything a component does in `useLayoutEffect` or
// `useEffect` is invisible here. In practice that is the depth-of-field
// wrapper's live tuning: these tests show the pass mounting and with which
// resolved inputs, `shelfDepthOfField.test.ts` shows what the tuning does to
// a real DepthOfFieldEffect, and `policyWiring.test.ts` shows the wrapper
// calling it. No assertion below stands in for that chain.
const harness = vi.hoisted(() => ({
  scene: {} as Record<string, unknown>,
  mounted: [] as Array<{ name: string; props: Record<string, unknown> }>,
  frames: [] as Array<{
    callback: (state: unknown, delta: number) => void;
    priority: number;
  }>,
  composer: { setSize: vi.fn() },
  size: { width: 1440, height: 900 },
  pixelRatio: 1,
}));

// React asks an external store for its SERVER snapshot while
// `renderToStaticMarkup` runs, and zustand answers that from a closure over
// the store's initial state that nothing outside the store can reach. So the
// scene store's read hook is replaced with a direct read of the same shape.
// Everything the store actually holds still comes from the real module.
vi.mock("../store", async (importOriginal) => {
  const actual = await importOriginal<typeof StacksStore>();
  return {
    ...actual,
    useStacks: (selector: (state: unknown) => unknown) =>
      selector({ ...actual.useStacks.getInitialState(), ...harness.scene }),
  };
});

vi.mock("@react-three/fiber", () => ({
  useFrame: (
    callback: (state: unknown, delta: number) => void,
    priority = 0,
  ) => {
    harness.frames.push({ callback, priority });
  },
  useThree: (selector: (state: unknown) => unknown) =>
    selector({
      size: harness.size,
      gl: { getPixelRatio: () => harness.pixelRatio },
    }),
}));

vi.mock("@react-three/postprocessing", async () => {
  const React = await import("react");
  const context = React.createContext<{ composer: unknown }>({
    composer: null,
  });
  const record = (name: string) => (props: Record<string, unknown>) => {
    harness.mounted.push({ name, props });
    return null;
  };
  return {
    Bloom: record("Bloom"),
    DepthOfField: record("DepthOfField"),
    EffectComposer: (props: Record<string, unknown>) => {
      harness.mounted.push({ name: "EffectComposer", props });
      return React.createElement(
        context.Provider,
        { value: { composer: harness.composer } },
        props.children as React.ReactNode,
      );
    },
    EffectComposerContext: context,
    GodRays: record("GodRays"),
    N8AO: record("N8AO"),
    SMAA: record("SMAA"),
    TiltShift2: record("TiltShift2"),
    ToneMapping: record("ToneMapping"),
    Vignette: record("Vignette"),
    // The two effects Effects.tsx builds itself reach the composer as bare
    // `<primitive>` nodes. `useDispose` is the one call every one of them
    // makes, so it is where they become observable.
    useDispose: (effect: { name: string }) => {
      harness.mounted.push({
        name: effect.name,
        props: { effect },
      });
    },
  };
});

const { default: Effects } = await import("./Effects");
const { registerCinematicSun } = await import("./cinematicSun");
const { resolveSceneQualityPlan } = await import("./quality");
const { DEFAULT_SCENE_COLOR_GRADE, CINEMATIC_PLUS_SCENE_COLOR_GRADE } =
  await import("./sceneColorGrade");
const { sceneQualityController } = await import("./sceneQualityController");

const planFor = (profile: "cinematic" | "balanced" | "safety") =>
  resolveSceneQualityPlan({
    mode: profile,
    profile,
    cssWidth: 1440,
    cssHeight: 900,
    deviceDpr: 2,
    touch: false,
  }).effects;

function render({
  dark = false,
  profile = "cinematic" as "cinematic" | "balanced" | "safety",
  sharpenAmount = 0,
  search,
  seated = false,
  golfFocused = false,
  activeUnit = 0,
}: {
  dark?: boolean;
  profile?: "cinematic" | "balanced" | "safety";
  sharpenAmount?: number;
  search?: string;
  seated?: boolean;
  golfFocused?: boolean;
  activeUnit?: number;
} = {}) {
  harness.scene = { seated, golfFocused, activeUnit };
  const previousWindow = (globalThis as { window?: unknown }).window;
  if (search !== undefined) {
    (globalThis as { window?: unknown }).window = {
      location: { search },
    };
  }
  try {
    renderToStaticMarkup(
      <Effects
        dark={dark}
        plan={planFor(profile)}
        sharpenAmount={sharpenAmount}
      />,
    );
  } finally {
    if (search !== undefined) {
      if (previousWindow === undefined)
        delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
  return {
    order: harness.mounted
      .map((entry) => entry.name)
      .filter((name) => name !== "EffectComposer"),
    props: (name: string) =>
      harness.mounted.find((entry) => entry.name === name)?.props,
    has: (name: string) => harness.mounted.some((entry) => entry.name === name),
  };
}

beforeEach(() => {
  harness.mounted.length = 0;
  harness.frames.length = 0;
  harness.composer.setSize.mockClear();
  harness.pixelRatio = 1;
  sceneQualityController.resetControls();
});

afterEach(() => {
  harness.scene = {};
  sceneQualityController.resetControls();
});

describe("the scene's postprocessing chain", () => {
  it("composites the approved passes in the approved order", () => {
    const chain = render({ profile: "cinematic", sharpenAmount: 0.4 });

    // Order is the contract, not decoration. The grade is display-referred so
    // it has to follow tone mapping; RCAS samples neighbours so it has to
    // follow the grade; SMAA reads finished pixels so it closes the chain.
    expect(chain.order).toEqual([
      "N8AO",
      "Bloom",
      "DepthOfField",
      "TiltShift2",
      "Vignette",
      "ToneMapping",
      "GradeEffect",
      "AdaptiveSharpenEffect",
      "SMAA",
    ]);
  });

  it("never mounts a disabled composer", () => {
    // A mounted-but-disabled composer pins the renderer to NoToneMapping and
    // blows out the frame. StacksCanvas unmounts this component instead, so
    // the composer must not carry an `enabled` prop at all.
    const chain = render();
    const composer = harness.mounted.find(
      (entry) => entry.name === "EffectComposer",
    );

    expect(composer?.props.enabled).toBeUndefined();
    expect(composer?.props.stencilBuffer).toBe(true);
    expect(composer?.props.multisampling).toBe(
      planFor("cinematic").multisampling,
    );
    expect(chain.order.length).toBeGreaterThan(0);
  });

  it("drops the expensive passes the plan turns off", () => {
    const safety = planFor("safety");
    const chain = render({ profile: "safety" });

    expect(safety.ambientOcclusion).toBe(false);
    expect(safety.depthOfField).toBe(false);
    expect(chain.has("N8AO")).toBe(false);
    expect(chain.has("DepthOfField")).toBe(false);
    // The cheap passes are what makes the fallback still look like the scene.
    expect(chain.order).toContain("Vignette");
    expect(chain.order).toContain("ToneMapping");
    expect(chain.order.at(-1)).toBe("SMAA");
  });

  it("sizes ambient occlusion from the plan rather than a fixed preset", () => {
    const plan = planFor("cinematic");
    const ao = render({ profile: "cinematic" }).props("N8AO");

    expect(ao).toMatchObject({
      halfRes: plan.ambientOcclusionHalfRes,
      quality: plan.ambientOcclusionQuality,
    });
    expect(ao?.aoRadius).toBeGreaterThan(0);
  });

  it("picks the bloom threshold and intensity for the mounted theme", () => {
    const plan = planFor("cinematic");

    const light = render({ dark: false }).props("Bloom");
    harness.mounted.length = 0;
    const dark = render({ dark: true }).props("Bloom");

    expect(light).toMatchObject({
      levels: plan.bloomLevels,
      resolutionScale: plan.bloomResolutionScale,
      luminanceSmoothing: plan.bloomLuminanceSmoothing,
      luminanceThreshold: plan.bloomLuminanceThreshold.light,
      intensity: plan.bloomIntensity.light,
    });
    expect(dark).toMatchObject({
      luminanceThreshold: plan.bloomLuminanceThreshold.dark,
      intensity: plan.bloomIntensity.dark,
    });
    // Bloom on the practicals, not on the moon: the dark threshold is the one
    // that has to clear the sky dome.
    expect(dark?.luminanceThreshold).not.toBe(light?.luminanceThreshold);
  });

  it("tone maps with ACES rather than the effect's AgX default", () => {
    expect(render().props("ToneMapping")?.mode).toBe(
      ToneMappingMode.ACES_FILMIC,
    );
  });

  it("eases the vignette in light theme and deepens it in dark", () => {
    const light = render({ dark: false }).props("Vignette");
    harness.mounted.length = 0;
    const dark = render({ dark: true }).props("Vignette");

    expect(light?.darkness).toBe(DEFAULT_SCENE_COLOR_GRADE.light.vignette);
    expect(dark?.darkness).toBe(DEFAULT_SCENE_COLOR_GRADE.dark.vignette);
    expect(light?.eskil).toBe(false);
    expect(Number(light?.darkness)).toBeLessThan(Number(dark?.darkness));
  });

  it("swaps the whole grade when Cinematic+ is selected", () => {
    sceneQualityController.setMode("cinematic+");
    const vignette = render({ dark: false }).props("Vignette");

    expect(vignette?.darkness).toBe(
      CINEMATIC_PLUS_SCENE_COLOR_GRADE.light.vignette,
    );
  });

  it("seeds the grade at the mounted theme so a dark first paint never ramps", () => {
    const dark = render({ dark: true }).props("GradeEffect") as
      | { effect: { uniforms: Map<string, { value: number }> } }
      | undefined;

    expect(dark?.effect.uniforms.get("uDark")?.value).toBe(1);
    expect(dark?.effect.uniforms.get("uDarkCurve")?.value).toBe(
      DEFAULT_SCENE_COLOR_GRADE.dark.curve,
    );
  });
});

describe("depth of field", () => {
  it("aims the mounted pass at the active shelf in world space", async () => {
    const { depthOfFieldTargetForUnit } = await import("./worldLayout");

    const shelf = render({ activeUnit: 3 }).props("DepthOfField");

    // The target is a constructor prop, so it is one of the few DoF values a
    // server render does see. Focus range, bokeh and resolution scale are not.
    expect(shelf?.target).toEqual([...depthOfFieldTargetForUnit(3)]);
    expect(planFor("cinematic").depthOfField).toBe(true);
  });

  it("keeps the pass mounted while a golf shot is in focus", () => {
    // What the widened range IS belongs to shelfDepthOfField.test.ts.
    expect(
      render({ activeUnit: 3, golfFocused: true }).has("DepthOfField"),
    ).toBe(true);
  });

  it("leaves the pass out when the camera is seated", () => {
    // Sitting down puts the camera inside the blur volume, where the
    // treatment reads as a smeared foreground instead of depth.
    expect(render({ seated: true }).has("DepthOfField")).toBe(false);
  });

  it("isolates the pass with ?nodof", () => {
    expect(render({ search: "?nodof" }).has("DepthOfField")).toBe(false);
  });
});

describe("the reversible comparison switches", () => {
  it("isolates the grade with ?nograde and keeps everything else", () => {
    const chain = render({ search: "?nograde" });

    expect(chain.has("GradeEffect")).toBe(false);
    expect(chain.has("ToneMapping")).toBe(true);
    expect(chain.order.at(-1)).toBe("SMAA");
  });

  it("isolates the side lens with ?notiltshift", () => {
    expect(render({ search: "?notiltshift" }).has("TiltShift2")).toBe(false);
    expect(render({ search: "?other" }).has("TiltShift2")).toBe(true);
  });

  it("anchors the side lens to the live viewport width", () => {
    const lens = render().props("TiltShift2");

    expect(Array.isArray(lens?.start)).toBe(true);
    expect(lens?.blur).toBeGreaterThan(0);
  });
});

describe("adaptive sharpening", () => {
  it("stays out of the composer at zero strength", () => {
    expect(render({ sharpenAmount: 0 }).has("AdaptiveSharpenEffect")).toBe(
      false,
    );
  });

  it("runs after tone mapping at the requested strength", () => {
    const chain = render({ sharpenAmount: 0.35 });
    const sharpen = chain.props("AdaptiveSharpenEffect") as
      | { effect: { uniforms: Map<string, { value: number }> } }
      | undefined;

    expect(chain.order.indexOf("AdaptiveSharpenEffect")).toBeGreaterThan(
      chain.order.indexOf("ToneMapping"),
    );
    expect(sharpen?.effect.uniforms.get("uAmount")?.value).toBe(0.35);
  });

  it("declares itself a convolution so its taps are isolated", async () => {
    const { EffectAttribute } = await import("postprocessing");
    const sharpen = render({ sharpenAmount: 0.35 }).props(
      "AdaptiveSharpenEffect",
    ) as { effect: { getAttributes: () => number } } | undefined;

    expect(sharpen?.effect.getAttributes()).toBe(EffectAttribute.CONVOLUTION);
  });
});

describe("god rays", () => {
  const mountSun = () => registerCinematicSun(new THREE.Mesh());

  it("stays out of the chain without Cinematic+", () => {
    const release = mountSun();
    expect(render({ dark: false }).has("GodRays")).toBe(false);
    release();
  });

  it("stays out of the chain in dark theme, where there is no sun to occlude", () => {
    const release = mountSun();
    sceneQualityController.setMode("cinematic+");
    expect(render({ dark: true }).has("GodRays")).toBe(false);
    release();
  });

  it("stays out of the chain until the scene registers a source", () => {
    sceneQualityController.setMode("cinematic+");
    expect(render({ dark: false }).has("GodRays")).toBe(false);
  });

  it("mounts an occlusion-aware pass for light-mode Cinematic+", () => {
    const release = mountSun();
    sceneQualityController.setMode("cinematic+");
    const rays = render({ dark: false }).props("GodRays");

    expect(rays?.sun).toBeInstanceOf(THREE.Mesh);
    expect(rays?.blur).toBe(true);
    expect(Number(rays?.resolutionScale)).toBeLessThan(1);
    release();
  });
});

describe("the composer's pixel-ratio corrector", () => {
  const runFrames = () => {
    for (const frame of harness.frames) frame.callback({}, 1 / 60);
  };

  it("resizes the composer's targets when the renderer's ratio moves", () => {
    render();
    runFrames();
    expect(harness.composer.setSize).toHaveBeenCalledWith(1440, 900);

    harness.composer.setSize.mockClear();
    runFrames();
    // Same ratio, no work: this runs every frame and must not resize on each.
    expect(harness.composer.setSize).not.toHaveBeenCalled();

    harness.pixelRatio = 1.62;
    runFrames();
    expect(harness.composer.setSize).toHaveBeenCalledTimes(1);
  });

  it("runs ahead of the composer's own render", () => {
    render();
    // r3f runs frame subscribers in ascending priority and the composer
    // renders at 1, so anything correcting the buffers has to sit below that.
    expect(harness.frames.every((frame) => frame.priority < 1)).toBe(true);
  });
});
