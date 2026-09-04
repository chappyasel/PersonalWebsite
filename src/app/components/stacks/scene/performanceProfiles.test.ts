import { describe, expect, it, vi } from "vitest";

import {
  PERFORMANCE_PROFILE_PRESENTATION,
  describePerformanceProfile,
} from "./performanceProfilePresentation";
import {
  PERFORMANCE_PROFILES,
  PERFORMANCE_PROFILE_IDS,
  PERFORMANCE_PROFILE_SETTING_KEYS,
  performanceProfileController,
  performanceProfileFromSearch,
  performanceProfileUrl,
} from "./performanceProfiles";
import { qualityModeFromSearch } from "./quality";
import { DEFAULT_SCENE_PERFORMANCE_SETTINGS } from "./scenePerformance";

describe("performance test profiles", () => {
  it("resolves only a known profile name and ignores typos", () => {
    expect(performanceProfileFromSearch("?perf-profile=floor")?.id).toBe(
      "floor",
    );
    expect(
      performanceProfileFromSearch(new URLSearchParams("perf-profile=low-dpr"))
        ?.id,
    ).toBe("low-dpr");
    for (const search of [
      "",
      "?perf-profile",
      "?perf-profile=Floor",
      "?perf-profile=nope",
    ])
      expect(performanceProfileFromSearch(search)).toBeNull();
  });

  it("only seeds settings the scene already exposes", () => {
    for (const id of PERFORMANCE_PROFILE_IDS) {
      const definition = PERFORMANCE_PROFILES[id];
      expect(definition.id).toBe(id);
      expect(PERFORMANCE_PROFILE_PRESENTATION[id].label.length).toBeGreaterThan(
        0,
      );
      expect(
        PERFORMANCE_PROFILE_PRESENTATION[id].question.length,
      ).toBeGreaterThan(20);
      for (const key of Object.keys(definition.performance))
        expect(DEFAULT_SCENE_PERFORMANCE_SETTINGS).toHaveProperty(key);
      if (definition.quality !== "auto")
        expect(definition.freezeAuto).toBe(false);
    }
    expect([...PERFORMANCE_PROFILE_SETTING_KEYS].sort()).toEqual([
      "highResolutionPhotos",
      "meadow",
      "postprocessing",
      "prewarmAllUnitVisuals",
    ]);
  });

  it("lets the profile pick the opening quality mode unless quality is explicit", () => {
    expect(qualityModeFromSearch("?perf-profile=floor")).toBe("safety");
    expect(qualityModeFromSearch("?perf-profile=retina-stress")).toBe(
      "showcase",
    );
    expect(qualityModeFromSearch("?perf-profile=low-dpr")).toBe("auto");
    expect(qualityModeFromSearch("?perf-profile=floor&quality=balanced")).toBe(
      "balanced",
    );
    expect(qualityModeFromSearch("?perf-profile=floor&quality=auto")).toBe(
      "auto",
    );
    // An unreadable explicit value is no instruction; the profile still holds.
    expect(qualityModeFromSearch("?perf-profile=floor&quality=nope")).toBe(
      "safety",
    );
    expect(qualityModeFromSearch("?quality=nope")).toBe("auto");
    expect(qualityModeFromSearch("")).toBe("auto");
  });

  it("rewrites the profile without disturbing report switches or the hash", () => {
    const href = "https://example.com/?perf-report=1&hud=1#books";
    expect(performanceProfileUrl(href, "light-boot")).toBe(
      "https://example.com/?perf-report=1&hud=1&perf-profile=light-boot#books",
    );
    expect(
      performanceProfileUrl(
        "https://example.com/?perf-profile=floor&perf-report=1",
        "no-composer",
      ),
    ).toBe("https://example.com/?perf-profile=no-composer&perf-report=1");
    expect(
      performanceProfileUrl(
        "https://example.com/?perf-profile=floor&perf-report=1",
        null,
      ),
    ).toBe("https://example.com/?perf-report=1");
  });

  it("lists the constrained control first and pulls every lever at once", () => {
    expect(PERFORMANCE_PROFILE_IDS[0]).toBe("constrained");
    expect(PERFORMANCE_PROFILE_IDS).toHaveLength(8);
    expect(PERFORMANCE_PROFILES.constrained).toMatchObject({
      quality: "safety",
      freezeAuto: false,
      resolutionCeiling: 1,
      performance: {
        postprocessing: false,
        prewarmAllUnitVisuals: false,
        highResolutionPhotos: false,
        meadow: false,
      },
    });
    expect(
      Object.keys(PERFORMANCE_PROFILES.constrained.performance).sort(),
    ).toEqual([...PERFORMANCE_PROFILE_SETTING_KEYS].sort());
    expect(qualityModeFromSearch("?perf-profile=constrained")).toBe("safety");
    expect(describePerformanceProfile(PERFORMANCE_PROFILES.constrained)).toBe(
      "safety forced · render scale pinned at 1x · postprocessing off · prewarmAllUnitVisuals off · highResolutionPhotos off · meadow off · learned quality ignored and not saved",
    );
  });

  it("isolates the meadow as a single variable", () => {
    expect(PERFORMANCE_PROFILES["no-meadow"]).toMatchObject({
      quality: "auto",
      freezeAuto: false,
      resolutionCeiling: null,
      performance: { meadow: false },
    });
    expect(Object.keys(PERFORMANCE_PROFILES["no-meadow"].performance)).toEqual([
      "meadow",
    ]);
    expect(describePerformanceProfile(PERFORMANCE_PROFILES["no-meadow"])).toBe(
      "Auto, adapting · meadow off · learned quality ignored and not saved",
    );
  });

  it("describes each profile from its definition", () => {
    expect(describePerformanceProfile(PERFORMANCE_PROFILES["low-dpr"])).toBe(
      "Auto, frozen at its starting axes · render scale pinned at 1x · learned quality ignored and not saved",
    );
    expect(describePerformanceProfile(PERFORMANCE_PROFILES["light-boot"])).toBe(
      "Auto, adapting · prewarmAllUnitVisuals off · highResolutionPhotos off · learned quality ignored and not saved",
    );
    expect(
      describePerformanceProfile(PERFORMANCE_PROFILES["retina-stress"]),
    ).toBe(
      "showcase forced · render scale pinned at 3x · learned quality ignored and not saved",
    );
  });

  it("publishes the active profile once per change", () => {
    const listener = vi.fn();
    const unsubscribe = performanceProfileController.subscribe(listener);
    performanceProfileController.set("floor");
    performanceProfileController.set("floor");
    expect(performanceProfileController.getSnapshot()).toBe("floor");
    expect(listener).toHaveBeenCalledTimes(1);
    performanceProfileController.set(null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
