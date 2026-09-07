import { describe, expect, it } from "vitest";

import { ABOUT_MODEL_POSES } from "./aboutScenePose";
import {
  ABOUT_GLOBE_LIVED_MARKER_COLOR,
  ABOUT_GLOBE_MAP,
  ABOUT_GLOBE_SCREENSHOT_SPIN_Y,
  ABOUT_GLOBE_VISITED_MARKER_COLOR,
  LIVED_PLACES,
  VISITED_PLACES,
} from "./aboutTravel";
import { AIC_CHAPTERS } from "./aicChapters";
import {
  GLOBE_LIVED_MARKS_NAME,
  GLOBE_MARKS_NAME,
  GLOBE_VISITED_MARKS_NAME,
  mergeGlobeMarkers,
} from "./globeBall";
import {
  globeLivedPlaceStatus,
  globeVisitedPlaceStatus,
} from "./globeChapterHover";

describe("About globe personal places", () => {
  it("keeps the five authored places in the red marker layer", () => {
    expect(LIVED_PLACES.map((place) => place.id)).toEqual([
      "san-francisco",
      "seattle",
      "washington-dc",
      "beijing",
      "marthas-vineyard",
    ]);
    expect(
      LIVED_PLACES.every(({ lat, lon }) => Number.isFinite(lat + lon)),
    ).toBe(true);
    expect(mergeGlobeMarkers(LIVED_PLACES)).toHaveLength(5);
    expect(mergeGlobeMarkers(VISITED_PLACES)).toHaveLength(25);

    const names = ABOUT_GLOBE_MAP.markerLayers?.map((layer) => layer.name);
    expect(names).toEqual([
      GLOBE_MARKS_NAME,
      GLOBE_VISITED_MARKS_NAME,
      GLOBE_LIVED_MARKS_NAME,
    ]);
    const visited = ABOUT_GLOBE_MAP.markerLayers?.[1];
    expect(visited?.markers).toBe(VISITED_PLACES);
    expect(visited?.color).toBe(ABOUT_GLOBE_VISITED_MARKER_COLOR);
    const lived = ABOUT_GLOBE_MAP.markerLayers?.[2];
    expect(lived?.markers).toBe(LIVED_PLACES);
    expect(lived?.color).toBe(ABOUT_GLOBE_LIVED_MARKER_COLOR);
    expect(lived?.lift).toBeGreaterThan(1.01);
  });

  it("uses present-tense copy only for San Francisco", () => {
    expect(
      LIVED_PLACES.filter((place) => place.current).map(({ id }) => id),
    ).toEqual(["san-francisco"]);
    expect(globeLivedPlaceStatus(LIVED_PLACES[0]!)).toBe("I live here now");
    expect(globeLivedPlaceStatus(LIVED_PLACES[1]!)).toBe("I lived here");
    expect(LIVED_PLACES[4]!.name).toBe("Martha's Vineyard");
    expect(globeVisitedPlaceStatus()).toBe("I've visited here");
  });

  it("pins screenshot mode to the Atlantic-facing composition", () => {
    const centreLongitude =
      -90 -
      ((ABOUT_MODEL_POSES.globe.rotation[1] + ABOUT_GLOBE_SCREENSHOT_SPIN_Y) *
        180) /
        Math.PI;
    const pins = [...AIC_CHAPTERS, ...VISITED_PLACES, ...LIVED_PLACES];
    const wrap = (degrees: number) => ((degrees + 540) % 360) - 180;
    const visible = (centre: number) =>
      pins.filter((pin) => Math.abs(wrap(pin.lon - centre)) <= 80).length;
    const best = Math.max(
      ...Array.from({ length: 360 }, (_, index) => visible(index - 180)),
    );

    expect(centreLongitude).toBeCloseTo(-44.16, 1);
    expect(visible(centreLongitude)).toBe(best);
  });
});
