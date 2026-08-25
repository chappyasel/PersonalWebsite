// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY,
  FIELD_NOTE_PLACEMENT_STORAGE_KEY,
  normalizeFieldNotePlacement,
  parseFieldNotePlacements,
  readFieldNotePlacement,
  resetFieldNotePlacements,
  saveFieldNotePlacement,
} from "./placement";

describe("Field Notes stamp placement", () => {
  it("keeps saved centers within the page", () => {
    expect(
      normalizeFieldNotePlacement({ placed: true, x: 4, y: -3, tilt: 9 }),
    ).toEqual({
      placed: true,
      x: 1,
      y: 0,
      tilt: 3,
    });
  });

  it("treats the old mount-offset shape as an unplaced stamp", () => {
    expect(normalizeFieldNotePlacement({ x: 0.08, y: -0.06, tilt: 1 })).toEqual(
      {
        placed: false,
        x: 0,
        y: 0,
        tilt: 0,
      },
    );
  });

  it("drops malformed and unknown saved placements", () => {
    expect(
      parseFieldNotePlacements(
        JSON.stringify({
          beacon: { placed: true, x: 0.84, y: 0.18, tilt: 0.6 },
          missing: { placed: true, x: 0.4, y: 0.5, tilt: 0 },
          "grand-tour": "up and to the left",
        }),
      ),
    ).toEqual({
      beacon: { placed: true, x: 0.84, y: 0.18, tilt: 0.6 },
    });
  });

  it("falls back to an empty arrangement when storage is corrupt", () => {
    expect(parseFieldNotePlacements("not json")).toEqual({});
  });

  describe("placement scopes", () => {
    afterEach(() => window.localStorage.clear());

    it("keeps catalog-page and overview-tray arrangements independent", () => {
      saveFieldNotePlacement(
        "beacon",
        { placed: true, x: 0.8, y: 0.2, tilt: 1 },
        "overview",
      );

      expect(
        window.localStorage.getItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY),
      ).toBeNull();
      expect(readFieldNotePlacement("beacon", "overview")).toEqual({
        placed: true,
        x: 0.8,
        y: 0.2,
        tilt: 1,
      });
      expect(readFieldNotePlacement("beacon")).toEqual({
        placed: false,
        x: 0,
        y: 0,
        tilt: 0,
      });
    });

    it("clears both scopes on a full placement reset", () => {
      saveFieldNotePlacement("beacon", {
        placed: true,
        x: 0.5,
        y: 0.5,
        tilt: 0,
      });
      saveFieldNotePlacement(
        "beacon",
        { placed: true, x: 0.1, y: 0.9, tilt: -1 },
        "overview",
      );

      resetFieldNotePlacements();

      expect(
        window.localStorage.getItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY),
      ).toBeNull();
      expect(
        window.localStorage.getItem(FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY),
      ).toBeNull();
    });
  });
});
