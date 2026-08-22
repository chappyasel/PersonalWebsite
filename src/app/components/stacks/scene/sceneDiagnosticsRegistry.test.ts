import fs from "node:fs";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import { MeadowDeformationController } from "./meadowDeformation";
import {
  diagnosticReloadInputsFromSearch,
  sceneDiagnosticsRegistry,
} from "./sceneDiagnosticsRegistry";
import { DEFAULT_SCENE_PERFORMANCE_SETTINGS } from "./scenePerformance";

const diagnosticsSource = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const registrySource = fs.readFileSync(
  new URL("./sceneDiagnosticsRegistry.ts", import.meta.url),
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

  it("gives every scene performance setting exactly one generated control", () => {
    const registered = sceneDiagnosticsRegistry.descriptors.flatMap(
      (descriptor) => descriptor.performanceSetting ?? [],
    );
    expect(registered.sort()).toEqual(
      Object.keys(DEFAULT_SCENE_PERFORMANCE_SETTINGS).sort(),
    );
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("does not subscribe to live stores until Diagnostics observes it", () => {
    expect(registrySource).not.toContain(
      "for (const store of stores) store.subscribe(invalidate)",
    );
    expect(registrySource).toContain(
      "stores.map((store) => store.subscribe(invalidate))",
    );
    expect(registrySource).toContain(
      "for (const unsubscribe of unsubscribeStores ?? []) unsubscribe()",
    );
  });

  it("resolves reload switches into initial live values", () => {
    expect(
      diagnosticReloadInputsFromSearch(
        "?nopostfx&nodof&notiltshift&nograde&nomeadow&hdPhotos=0&grassDeformation=off",
      ),
    ).toEqual({
      postprocessing: false,
      skipDepthOfField: true,
      sideTiltShift: false,
      colorGrade: false,
      meadow: false,
      highResolutionPhotos: false,
      grassDeformation: false,
    });
    expect(diagnosticReloadInputsFromSearch("?hdPhotos=1")).toEqual({});
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
});
