import fs from "node:fs";
import type * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { MeadowDeformationController } from "./meadowDeformation";
import {
  type DiagnosticRegistryEntry,
  type DiagnosticRegistryStore,
  createSceneDiagnosticsRegistry,
  sceneDiagnosticsRegistry,
} from "./sceneDiagnosticsRegistry";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  scenePerformanceController,
} from "./scenePerformance";
import { sceneQualityController } from "./sceneQualityController";

const diagnosticsSource = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const canvasSource = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);
class NoWorkRenderer {
  renders = 0;
  clears = 0;

  render() {
    this.renders += 1;
  }

  clear() {
    this.clears += 1;
  }
}

describe("Scene Diagnostics registry", () => {
  it("reads and overrides the resolved automatic meadow state", () => {
    scenePerformanceController.reset();
    sceneQualityController.resetControls();
    sceneQualityController.publishRuntime({
      plan: { environment: { meadow: false } },
    } as Parameters<typeof sceneQualityController.publishRuntime>[0]);

    expect(sceneDiagnosticsRegistry.read("render.meadow")).toBe(false);
    sceneDiagnosticsRegistry.update("render.meadow", true);
    expect(scenePerformanceController.isOverridden("meadow")).toBe(true);
    expect(sceneDiagnosticsRegistry.read("render.meadow")).toBe(true);

    scenePerformanceController.reset();
    sceneQualityController.resetControls();
  });
  it("owns unique stable IDs and complete descriptor metadata", () => {
    const ids = sceneDiagnosticsRegistry.descriptors.map(
      (descriptor) => descriptor.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const descriptor of sceneDiagnosticsRegistry.descriptors) {
      expect(descriptor.id).toMatch(/^[a-z][a-z0-9.-]+$/);
      expect(descriptor.group).toBeTruthy();
      expect(descriptor.label).toBeTruthy();
      expect(descriptor.help).toBeTruthy();
      expect(descriptor.allowedValues.kind).toMatch(/^(set|range)$/);
      expect(descriptor.behavior.reset).toBe("reload");
      if (descriptor.allowedValues.kind === "range") {
        if (descriptor.defaultValue === null)
          expect(descriptor.allowedValues.automatic).toEqual({
            value: null,
            label: "Resolved policy",
          });
        else {
          expect(descriptor.defaultValue).toEqual(expect.any(Number));
          expect(descriptor.defaultValue as number).toBeGreaterThanOrEqual(
            descriptor.allowedValues.min,
          );
          expect(descriptor.defaultValue as number).toBeLessThanOrEqual(
            descriptor.allowedValues.max,
          );
        }
      } else {
        expect(
          descriptor.allowedValues.values.some((option) =>
            Object.is(option.value, descriptor.defaultValue),
          ),
        ).toBe(true);
      }
      if (descriptor.experimental)
        expect(descriptor.productionCost?.activeValues).not.toContain(
          descriptor.defaultValue,
        );
      for (const value of descriptor.experimentalValues ?? []) {
        expect(value).not.toEqual(descriptor.defaultValue);
        expect(descriptor.allowedValues.kind).toBe("set");
        if (descriptor.allowedValues.kind === "set")
          expect(
            descriptor.allowedValues.values.some((option) =>
              Object.is(option.value, value),
            ),
          ).toBe(true);
      }
    }
  });

  it("matches every declared default to the fresh live state", () => {
    for (const descriptor of sceneDiagnosticsRegistry.descriptors)
      expect(sceneDiagnosticsRegistry.read(descriptor.id)).toEqual(
        descriptor.defaultValue,
      );
  });

  it("covers every descriptor in a generated panel section", () => {
    const generated = (["render", "simulate", "inspect"] as const).flatMap(
      (panel) =>
        sceneDiagnosticsRegistry
          .sections(panel)
          .flatMap((section) => section.controls),
    );
    expect(generated.map((descriptor) => descriptor.id).sort()).toEqual(
      sceneDiagnosticsRegistry.descriptors
        .map((descriptor) => descriptor.id)
        .sort(),
    );
    for (const section of [
      ...sceneDiagnosticsRegistry.sections("render"),
      ...sceneDiagnosticsRegistry.sections("simulate"),
      ...sceneDiagnosticsRegistry.sections("inspect"),
    ]) {
      if (section.id === "inspect.scope")
        expect(diagnosticsSource).toContain('id="inspect.scope"');
      else expect(diagnosticsSource).toContain(`groupId="${section.id}"`);
    }
  });

  it("offers the named test profiles as one reload-aware control", () => {
    const control = sceneDiagnosticsRegistry.descriptors.find(
      (descriptor) => descriptor.id === "quality.test-profile",
    );
    expect(control).toMatchObject({
      group: "render.profile",
      valueKind: "enum",
      defaultValue: null,
      reloadInput: "perf-profile",
    });
    expect(
      control?.allowedValues.kind === "set"
        ? control.allowedValues.values.map((option) => option.value)
        : [],
    ).toEqual([
      null,
      "constrained",
      "unknown-device",
      "floor",
      "low-dpr",
      "no-composer",
      "light-boot",
      "no-meadow",
      "retina-stress",
    ]);
    expect(() =>
      sceneDiagnosticsRegistry.update("quality.test-profile", "nope"),
    ).toThrow(/Invalid value/);
  });

  it("gives every scene performance setting exactly one generated control", () => {
    const registered = sceneDiagnosticsRegistry.descriptors.flatMap(
      (descriptor) => descriptor.performanceSetting ?? [],
    );
    expect(registered.sort()).toEqual(
      Object.keys(DEFAULT_SCENE_PERFORMANCE_SETTINGS).sort(),
    );
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("presents enabled render passes as checked instead of unchecked skip flags", () => {
    scenePerformanceController.reset();
    for (const id of [
      "render.ambient-occlusion",
      "render.bloom",
      "render.depth-of-field",
    ]) {
      expect(sceneDiagnosticsRegistry.read(id)).toBe(true);
      sceneDiagnosticsRegistry.update(id, false);
      expect(sceneDiagnosticsRegistry.read(id)).toBe(false);
    }
    expect(scenePerformanceController.getSnapshot()).toMatchObject({
      skipAmbientOcclusion: true,
      skipBloom: true,
      skipDepthOfField: true,
    });
    scenePerformanceController.reset();
  });

  it("offers both optical quality levels in the live DoF model selector", () => {
    const model = sceneDiagnosticsRegistry.descriptors.find(
      (descriptor) => descriptor.id === "render.dof-model",
    );

    expect(
      model?.allowedValues.kind === "set"
        ? model.allowedValues.values.map((option) => option.value)
        : [],
    ).toEqual([
      "current",
      "optical-prototype-16",
      "optical-prototype",
      "optical-prototype-64",
    ]);

    sceneDiagnosticsRegistry.update("render.dof-model", "optical-prototype-16");
    expect(sceneDiagnosticsRegistry.read("render.dof-model")).toBe(
      "optical-prototype-16",
    );
    sceneQualityController.resetControls();
  });

  it("keeps every approved Render feature checked at production defaults", () => {
    const renderBooleans = sceneDiagnosticsRegistry
      .sections("render")
      .flatMap((section) => section.controls)
      .filter(
        (descriptor) =>
          descriptor.valueKind === "boolean" && !descriptor.experimental,
      );

    expect(renderBooleans.length).toBeGreaterThan(0);
    expect(
      renderBooleans.filter((descriptor) => descriptor.defaultValue !== true),
    ).toEqual([]);
  });

  it("keeps the descriptor inventory behind the lazy diagnostics chunk", () => {
    expect(canvasSource).toContain('import "./scene/sceneDiagnosticsRuntime"');
    expect(canvasSource).not.toContain("sceneDiagnosticsRegistry");
    expect(diagnosticsSource).toContain(
      'from "../scene/sceneDiagnosticsRegistry"',
    );
  });

  it("declares the exact optimization preset inside categorized render controls", () => {
    expect(
      sceneDiagnosticsRegistry.descriptors
        .filter((descriptor) => descriptor.optimizationPreset)
        .map((descriptor) => descriptor.id),
    ).toEqual([
      "render.suspend-settled-props",
      "render.pause-prewarm-travel",
      "render.prewarm-all-visuals",
      "render.stable-light-shape",
      "render.nearby-lights",
      "render.simplified-far-grass",
      "render.practical-glow",
      "render.placard-material",
      "render.effective-dpr-rungs",
      "render.adaptive-sharpen",
      "render.ambient-occlusion",
      "render.bloom",
      "render.depth-of-field",
      "render.virtualize-units",
      "render.remember-travel-declines",
      "render.balance-meadow-tiles",
      "render.suspend-hover-work",
    ]);
    expect(
      sceneDiagnosticsRegistry.sections("render").map((section) => section.id),
    ).toEqual(
      expect.arrayContaining([
        "render.lens",
        "render.passes",
        "render.scene-effects",
        "render.optimizations",
        "render.scheduling",
      ]),
    );
    expect(
      sceneDiagnosticsRegistry.sections("render").map((section) => section.id),
    ).not.toEqual(
      expect.arrayContaining(["render.optional", "render.compositing"]),
    );
  });

  it("keeps every expensive default-off path allocation and frame-work free", () => {
    const expensiveDefaultOff = sceneDiagnosticsRegistry.descriptors.filter(
      (descriptor) =>
        descriptor.productionCost &&
        !descriptor.productionCost.activeValues.some((value) =>
          Object.is(value, descriptor.defaultValue),
        ),
    );
    expect(expensiveDefaultOff.map((descriptor) => descriptor.id)).toContain(
      "meadow.persistent-deformation",
    );
    expect(expensiveDefaultOff.map((descriptor) => descriptor.id)).toContain(
      "quality.mode",
    );
    for (const descriptor of expensiveDefaultOff)
      expect(descriptor.productionCost?.offPath).toEqual({
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      });

    const renderer = new NoWorkRenderer();
    const deformation = new MeadowDeformationController(
      renderer as unknown as THREE.WebGLRenderer,
      "off",
      false,
    );
    deformation.tick(1, false);
    expect(deformation.getSnapshot().textureCount).toBe(0);
    expect(renderer.renders).toBe(0);
    expect(renderer.clears).toBe(0);
    deformation.dispose();
  });

  it("can disable the temporary 3D artifact renderer live", () => {
    const descriptor = sceneDiagnosticsRegistry.descriptors.find(
      (entry) => entry.id === "render.model-artifact-preview",
    );
    expect(descriptor).toMatchObject({
      label: "3D artifact preview",
      defaultValue: true,
      experimental: false,
      productionCost: {
        activeValues: [true],
        offPath: {
          renderTargetAllocations: 0,
          textureSamples: 0,
          perFrameWork: false,
        },
      },
    });

    sceneDiagnosticsRegistry.update("render.model-artifact-preview", false);
    expect(sceneDiagnosticsRegistry.read("render.model-artifact-preview")).toBe(
      false,
    );
    sceneDiagnosticsRegistry.update("render.model-artifact-preview", true);
  });
});

class FakeStore implements DiagnosticRegistryStore {
  private listeners = new Set<() => void>();
  readonly attach = vi.fn();
  readonly detach = vi.fn();

  subscribe = (listener: () => void) => {
    this.attach();
    this.listeners.add(listener);
    return () => {
      this.detach();
      this.listeners.delete(listener);
    };
  };

  emit() {
    for (const listener of this.listeners) listener();
  }
}

function booleanEntry(
  options: Readonly<{
    id: string;
    group?: string;
    store: DiagnosticRegistryStore;
    read: () => boolean;
    update?: (value: boolean) => void;
    optimizationPreset?: Readonly<{ optimized: boolean; unoptimized: boolean }>;
  }>,
): DiagnosticRegistryEntry {
  return {
    id: options.id,
    panel: "render",
    group: options.group ?? "render.test",
    label: options.id,
    help: "Test control.",
    valueKind: "boolean",
    allowedValues: {
      kind: "set",
      values: [
        { value: false, label: "Off" },
        { value: true, label: "On" },
      ],
    },
    defaultValue: options.read(),
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: options.store,
    read: options.read,
    update: options.update
      ? (value) => options.update?.(Boolean(value))
      : undefined,
    optimizationPreset: options.optimizationPreset,
  };
}

function registryFor(entries: readonly DiagnosticRegistryEntry[]) {
  return createSceneDiagnosticsRegistry({
    entries,
    sectionDefinitions: [{ id: "render.test", panel: "render", label: "Test" }],
  });
}

describe("Scene Diagnostics registry behavior", () => {
  it("attaches stores on the first subscriber and detaches on the last", () => {
    const store = new FakeStore();
    const registry = registryFor([
      booleanEntry({ id: "test.one", store, read: () => false }),
      booleanEntry({ id: "test.two", store, read: () => true }),
    ]);
    const first = registry.subscribe(() => undefined);
    const second = registry.subscribe(() => undefined);
    expect(store.attach).toHaveBeenCalledOnce();

    first();
    expect(store.detach).not.toHaveBeenCalled();
    second();
    expect(store.detach).toHaveBeenCalledOnce();
  });

  it("keeps snapshot identity until a store invalidates it", () => {
    const store = new FakeStore();
    let value = false;
    const registry = registryFor([
      booleanEntry({ id: "test.value", store, read: () => value }),
    ]);
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const first = registry.getSnapshot();
    expect(registry.getSnapshot()).toBe(first);

    value = true;
    store.emit();
    const second = registry.getSnapshot();
    expect(listener).toHaveBeenCalledOnce();
    expect(second).not.toBe(first);
    expect(second["test.value"]?.value).toBe(true);
    unsubscribe();
  });

  it("rejects unknown, read-only, and invalid updates", () => {
    const store = new FakeStore();
    const registry = registryFor([
      booleanEntry({ id: "test.read-only", store, read: () => false }),
    ]);
    expect(() => registry.read("test.unknown")).toThrow("Unknown");
    expect(() => registry.update("test.unknown", true)).toThrow("Unknown");
    expect(() => registry.update("test.read-only", true)).toThrow("read-only");

    const update = vi.fn();
    const writable = registryFor([
      booleanEntry({
        id: "test.boolean",
        store,
        read: () => false,
        update,
      }),
    ]);
    expect(() => writable.update("test.boolean", "yes")).toThrow("Invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("sets only writable boolean members of a group", () => {
    const store = new FakeStore();
    const first = vi.fn();
    const other = vi.fn();
    const registry = registryFor([
      booleanEntry({
        id: "test.first",
        store,
        read: () => false,
        update: first,
      }),
      booleanEntry({ id: "test.read-only", store, read: () => false }),
      booleanEntry({
        id: "test.other",
        group: "render.other",
        store,
        read: () => false,
        update: other,
      }),
    ]);
    registry.setGroup("render.test", true);
    expect(first).toHaveBeenCalledWith(true);
    expect(other).not.toHaveBeenCalled();
  });

  it("applies exact optimized and unoptimized patches", () => {
    const store = new FakeStore();
    const patches: Array<readonly [string, boolean]> = [];
    const values = new Map<string, boolean>();
    const member = (id: string, optimized: boolean, unoptimized: boolean) =>
      booleanEntry({
        id,
        store,
        read: () => values.get(id) ?? false,
        update: (value) => {
          values.set(id, value);
          patches.push([id, value]);
        },
        optimizationPreset: { optimized, unoptimized },
      });
    const registry = registryFor([
      member("test.first", true, false),
      member("test.second", false, true),
      booleanEntry({
        id: "test.omitted",
        store,
        read: () => true,
        update: (value) => patches.push(["test.omitted", value]),
      }),
    ]);

    registry.applyOptimizationPreset("optimized");
    expect(registry.matchesOptimizationPreset("optimized")).toBe(true);
    registry.applyOptimizationPreset("unoptimized");
    expect(registry.matchesOptimizationPreset("unoptimized")).toBe(true);
    expect(patches).toEqual([
      ["test.first", true],
      ["test.second", false],
      ["test.first", false],
      ["test.second", true],
    ]);
  });

  it("treats range step as presentation metadata", () => {
    const store = new FakeStore();
    const update = vi.fn();
    const range: DiagnosticRegistryEntry = {
      id: "test.range",
      panel: "render",
      group: "render.test",
      label: "Range",
      help: "Test range.",
      valueKind: "range",
      allowedValues: { kind: "range", min: 0, max: 1, step: 0.1, decimals: 2 },
      defaultValue: 0,
      experimental: false,
      behavior: { read: "live", update: "session-only", reset: "reload" },
      store,
      read: () => 0,
      update,
    };
    const registry = registryFor([range]);
    registry.update("test.range", 0.25);
    expect(update).toHaveBeenCalledWith(0.25);
    expect(() => registry.update("test.range", 1.01)).toThrow("Invalid");
    expect(() => registry.update("test.range", Number.NaN)).toThrow("Invalid");
  });
});
