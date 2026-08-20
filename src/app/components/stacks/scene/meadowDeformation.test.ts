import { UNIT_COUNT } from "../data";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { GOLF_COURSE_CENTER, GOLF_GREEN } from "./golf/golfCourse";
import {
  MEADOW_DEFORMATION,
  MeadowDeformationController,
  blendMeadowDeformation,
  decayMeadowDeformation,
  encodeMeadowDeformation,
  meadowDeformationCapsule,
  meadowDeformationContains,
  meadowDeformationScissor,
  meadowDeformationStampFlattening,
  meadowDeformationStampStrength,
  meadowDeformationWorldToUv,
  withMeadowRendererState,
} from "./meadowDeformation";
import type { MeadowPhysicalEvent } from "./meadowDisturbance";
import { UNIT_SPACING, unitPose } from "./worldLayout";

function event(
  overrides: Partial<MeadowPhysicalEvent> = {},
): MeadowPhysicalEvent {
  return {
    kind: "trail",
    startX: 1,
    startZ: 1,
    endX: 2,
    endZ: 1,
    y: -1.1,
    directionX: 1,
    directionZ: 0,
    strength: 0.8,
    radius: 0.4,
    timeScale: 1,
    revision: 1,
    ...overrides,
  };
}

class FakeRenderer {
  target: THREE.WebGLRenderTarget | null = null;
  viewport = new THREE.Vector4(4, 5, 6, 7);
  scissor = new THREE.Vector4(8, 9, 10, 11);
  scissorTest = true;
  autoClear = true;
  clearColor = new THREE.Color("#123456");
  clearAlpha = 0.45;
  renders = 0;
  clears = 0;
  throwOnRender = false;
  physicalViewport = new THREE.Vector4();
  physicalScissor = new THREE.Vector4();
  renderedScissors: THREE.Vector4[] = [];

  constructor(private readonly pixelRatio = 1) {}

  getRenderTarget() {
    return this.target;
  }
  setRenderTarget(target: THREE.WebGLRenderTarget | null) {
    this.target = target;
    if (target) {
      this.physicalViewport.copy(target.viewport);
      this.physicalScissor.copy(target.scissor);
    } else {
      this.physicalViewport.copy(this.viewport).multiplyScalar(this.pixelRatio);
      this.physicalScissor.copy(this.scissor).multiplyScalar(this.pixelRatio);
    }
  }
  getViewport(target: THREE.Vector4) {
    return target.copy(this.viewport);
  }
  setViewport(
    value: THREE.Vector4 | number,
    y?: number,
    z?: number,
    w?: number,
  ) {
    if (value instanceof THREE.Vector4) this.viewport.copy(value);
    else this.viewport.set(value, y!, z!, w!);
    this.physicalViewport.copy(this.viewport).multiplyScalar(this.pixelRatio);
  }
  getScissor(target: THREE.Vector4) {
    return target.copy(this.scissor);
  }
  setScissor(
    value: THREE.Vector4 | number,
    y?: number,
    z?: number,
    w?: number,
  ) {
    if (value instanceof THREE.Vector4) this.scissor.copy(value);
    else this.scissor.set(value, y!, z!, w!);
    this.physicalScissor.copy(this.scissor).multiplyScalar(this.pixelRatio);
  }
  getScissorTest() {
    return this.scissorTest;
  }
  setScissorTest(value: boolean) {
    this.scissorTest = value;
  }
  getClearColor(target: THREE.Color) {
    return target.copy(this.clearColor);
  }
  getClearAlpha() {
    return this.clearAlpha;
  }
  setClearColor(value: THREE.Color | number, alpha = 1) {
    this.clearColor.set(value);
    this.clearAlpha = alpha;
  }
  clear() {
    this.clears += 1;
  }
  render() {
    this.renders += 1;
    this.renderedScissors.push(this.physicalScissor.clone());
    if (this.throwOnRender) throw new Error("render failed");
  }
}

function renderer(fake = new FakeRenderer()) {
  return fake as unknown as THREE.WebGLRenderer;
}

describe("meadow deformation geometry", () => {
  it("maps the bounded world to UVs and clips scissors", () => {
    expect(meadowDeformationWorldToUv(-4.2, -21)).toEqual({ u: 0, v: 0 });
    expect(meadowDeformationWorldToUv(29.4, 4.6)).toEqual({ u: 1, v: 1 });
    const scissor = meadowDeformationScissor(
      meadowDeformationCapsule(event({ startX: -4.3, endX: -4.1 })),
      256,
    );
    expect(scissor).not.toBeNull();
    expect(scissor!.x).toBe(0);
    expect(scissor!.width).toBeLessThan(12);
    expect(
      meadowDeformationScissor(
        meadowDeformationCapsule(
          event({ startX: 40, endX: 41, startZ: 40, endZ: 40 }),
        ),
        256,
      ),
    ).toBeNull();
  });

  it("extends directional capsules behind contact and keeps directionless impacts circular", () => {
    const directional = meadowDeformationCapsule(event());
    expect(directional.startX).toBeCloseTo(0.4);
    expect(directional.endX).toBeCloseTo(2.12);
    const circle = meadowDeformationCapsule(
      event({
        kind: "impact",
        startX: 4,
        endX: 4,
        startZ: 2,
        endZ: 2,
        directionX: 0,
      }),
    );
    expect(circle.startX).toBe(4);
    expect(circle.endX).toBe(4);
    expect(circle.startZ).toBe(2);
    expect(circle.endZ).toBe(2);
  });

  it("encodes premultiplied direction and blends source-over", () => {
    expect(encodeMeadowDeformation(1, -1, 0.5, 0.8)).toEqual([
      0.8, 0, 0.4, 0.8,
    ]);
    expect(
      blendMeadowDeformation([0.5, 0.25, 0.25, 0.5], [0.2, 0.4, 0.6, 0.8]),
    ).toEqual([0.6, 0.45, 0.55, 0.9]);
  });

  it("keeps strong marks obvious for a second and accelerates weaker decay", () => {
    const strong = decayMeadowDeformation(1, 1);
    const weak = decayMeadowDeformation(0.3, 1);
    expect(strong).toBeGreaterThan(0.7);
    expect(weak / 0.3).toBeLessThan(strong);
    expect(decayMeadowDeformation(0.001, 1)).toBe(0);
  });

  it("keeps weak trails visibly compressed without squaring their strength", () => {
    expect(meadowDeformationStampFlattening(0.2)).toBe(1);
    expect(meadowDeformationStampFlattening(0)).toBe(0);
  });

  it("covers every current prop lane and the golf corridor", () => {
    for (let index = 0; index < UNIT_COUNT; index += 1) {
      const pose = unitPose(index);
      expect(meadowDeformationContains(pose.position[0] - 3.2, -3.5)).toBe(
        true,
      );
      expect(meadowDeformationContains(pose.position[0] + 2.9, 3.5)).toBe(true);
    }
    const courseRadius = Math.hypot(GOLF_GREEN.width, GOLF_GREEN.depth) / 2;
    expect(
      meadowDeformationContains(
        GOLF_COURSE_CENTER.x - courseRadius,
        GOLF_COURSE_CENTER.z - courseRadius,
      ),
    ).toBe(true);
    expect(
      meadowDeformationContains(
        GOLF_COURSE_CENTER.x + courseRadius,
        GOLF_COURSE_CENTER.z + courseRadius,
      ),
    ).toBe(true);
    expect((UNIT_COUNT - 1) * UNIT_SPACING).toBeLessThan(29.4);
  });
});

describe("meadow deformation renderer lifecycle", () => {
  it("holds a fresh mark for one second before recovery begins", () => {
    const controller = new MeadowDeformationController(
      renderer(),
      "full",
      false,
    );
    controller.stamp(event(), 1);

    controller.tick(1.99, false);
    expect(controller.getSnapshot().recoveryDraws).toBe(0);

    controller.tick(2.11, false);
    expect(controller.getSnapshot().recoveryDraws).toBe(1);
    controller.dispose();
  });

  it("stamps in render-target pixels instead of multiplying by canvas DPR", () => {
    const fake = new FakeRenderer(2);
    const controller = new MeadowDeformationController(
      renderer(fake),
      "full",
      false,
    );
    const expected = meadowDeformationScissor(
      meadowDeformationCapsule(event()),
      MEADOW_DEFORMATION.full.size,
    )!;

    controller.stamp(event(), 0);

    expect(fake.renderedScissors.at(-1)).toEqual(
      new THREE.Vector4(
        expected.x,
        expected.y,
        expected.width,
        expected.height,
      ),
    );
    controller.dispose();
  });

  it("restores renderer state after successful and failed passes", () => {
    const fake = new FakeRenderer();
    const before = {
      viewport: fake.viewport.clone(),
      scissor: fake.scissor.clone(),
      scissorTest: fake.scissorTest,
      autoClear: fake.autoClear,
      clearColor: fake.clearColor.clone(),
      clearAlpha: fake.clearAlpha,
    };
    withMeadowRendererState(renderer(fake), () => {
      fake.setViewport(0, 0, 1, 1);
      fake.setScissorTest(false);
      fake.autoClear = false;
      fake.setClearColor(0xffffff, 0);
    });
    expect(fake.viewport).toEqual(before.viewport);
    expect(fake.scissorTest).toBe(before.scissorTest);
    expect(() =>
      withMeadowRendererState(renderer(fake), () => {
        fake.setScissor(0, 0, 1, 1);
        throw new Error("pass failed");
      }),
    ).toThrow("pass failed");
    expect(fake.scissor).toEqual(before.scissor);
    expect(fake.autoClear).toBe(before.autoClear);
    expect(fake.clearColor).toEqual(before.clearColor);
    expect(fake.clearAlpha).toBe(before.clearAlpha);
  });

  it("allocates nothing while off and shuts recovery down after seven seconds", () => {
    const fake = new FakeRenderer();
    const controller = new MeadowDeformationController(
      renderer(fake),
      "off",
      false,
    );
    expect(controller.getSnapshot().textureCount).toBe(0);
    expect(controller.stamp(event(), 0)).toBe(false);
    expect(fake.renders).toBe(0);
    controller.setQuality("full");
    expect(controller.getSnapshot().textureCount).toBe(2);
    expect(controller.stamp(event(), 1)).toBe(true);
    controller.tick(2.11, false);
    expect(controller.getSnapshot().recoveryDraws).toBe(1);
    controller.tick(2.5, true);
    controller.tick(3.5, false);
    expect(controller.getSnapshot().recoveryDraws).toBe(2);
    controller.tick(8.01, false);
    expect(controller.getSnapshot().active).toBe(false);
    const draws = controller.getSnapshot().recoveryDraws;
    controller.tick(12, false);
    expect(controller.getSnapshot().recoveryDraws).toBe(draws);
    controller.dispose();
    expect(controller.getSnapshot().textureCount).toBe(0);
  });

  it("holds reduced-motion marks at capped strength until reset", () => {
    expect(meadowDeformationStampStrength(0.9, true)).toBe(0.35);
    const controller = new MeadowDeformationController(
      renderer(),
      "lean",
      true,
    );
    controller.stamp(event(), 0);
    controller.tick(MEADOW_DEFORMATION.idleClearSeconds + 4, false);
    expect(controller.getSnapshot()).toMatchObject({
      active: true,
      recoveryDraws: 0,
    });
    controller.applyResetRevision(4);
    expect(controller.getSnapshot()).toMatchObject({
      active: false,
      resetRevision: 4,
    });
    controller.dispose();
  });

  it("disposes temporary resize targets and restores state after a failed resample", () => {
    const fake = new FakeRenderer();
    const controller = new MeadowDeformationController(
      renderer(fake),
      "full",
      false,
    );
    const beforeViewport = fake.viewport.clone();
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    fake.throwOnRender = true;
    expect(() => controller.setQuality("lean")).toThrow("render failed");
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(
      (controller.texture?.image as { width?: number } | undefined)?.width,
    ).toBe(512);
    expect(controller.getSnapshot().textureCount).toBe(2);
    expect(fake.viewport).toEqual(beforeViewport);
    fake.throwOnRender = false;
    dispose.mockRestore();
    controller.dispose();
  });

  it("resamples full and lean targets across repeated lifecycle changes", () => {
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const controller = new MeadowDeformationController(
      renderer(),
      "off",
      false,
    );
    for (let cycle = 0; cycle < 5; cycle += 1) {
      controller.setQuality("full");
      expect(controller.getSnapshot().textureCount).toBe(2);
      controller.stamp(event({ revision: cycle + 1 }), cycle);
      controller.setQuality("lean");
      expect(controller.getSnapshot().textureCount).toBe(2);
      expect(
        (controller.texture?.image as { width?: number } | undefined)?.width,
      ).toBe(256);
      controller.setQuality("off");
      expect(controller.getSnapshot().textureCount).toBe(0);
    }
    expect(dispose).toHaveBeenCalledTimes(20);
    controller.dispose();
    dispose.mockRestore();
  });
});
