import { afterEach, describe, expect, it, vi } from "vitest";

import {
  artifactShadeSamples,
  publishArtifactShadeSample,
  resetArtifactShadeSamples,
  subscribeArtifactShadeSamples,
} from "./artifactShadeSamples";

const SAMPLE = { brightness: 0.9, tint: [1, 0.9, 0.85] } as const;

afterEach(resetArtifactShadeSamples);

describe("artifact shade sample store", () => {
  it("publishes a sample under its artifact and notifies", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArtifactShadeSamples(listener);
    publishArtifactShadeSample("about-delicate-arch-v8", SAMPLE);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(artifactShadeSamples().get("about-delicate-arch-v8")).toBe(SAMPLE);
    unsubscribe();
  });

  it("hands out a NEW map each publish", () => {
    // useSyncExternalStore compares snapshots by identity. Mutating one map in
    // place would leave the preview wearing the previous print's shade.
    const first = artifactShadeSamples();
    publishArtifactShadeSample("about-profile-full-v8", SAMPLE);
    const second = artifactShadeSamples();
    expect(second).not.toBe(first);
    expect(first.has("about-profile-full-v8")).toBe(false);
  });

  it("clears a sample when a print cannot be measured", () => {
    publishArtifactShadeSample("about-delicate-arch-v8", SAMPLE);
    publishArtifactShadeSample("about-delicate-arch-v8", null);
    expect(artifactShadeSamples().has("about-delicate-arch-v8")).toBe(false);
  });

  it("does not churn the snapshot clearing something never measured", () => {
    // A failed probe on an unmeasured print is the common case; re-rendering
    // every preview for it would be pure waste.
    const listener = vi.fn();
    const unsubscribe = subscribeArtifactShadeSamples(listener);
    const before = artifactShadeSamples();
    publishArtifactShadeSample("never-measured", null);
    expect(listener).not.toHaveBeenCalled();
    expect(artifactShadeSamples()).toBe(before);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    subscribeArtifactShadeSamples(listener)();
    publishArtifactShadeSample("about-delicate-arch-v8", SAMPLE);
    expect(listener).not.toHaveBeenCalled();
  });
});
