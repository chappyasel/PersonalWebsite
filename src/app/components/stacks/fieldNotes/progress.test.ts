import { afterEach, describe, expect, it, vi } from "vitest";

import { FIELD_NOTES } from "./catalog";
import { FIELD_NOTE_PLACEMENT_STORAGE_KEY } from "./placement";
import {
  EMPTY_FIELD_NOTES_PROGRESS,
  type FieldNoteEvent,
  type FieldNotesProgress,
  parseFieldNotesProgress,
  previewFieldNoteAward,
  reduceFieldNotesProgress,
  setAllFieldNotesFound,
  subscribeFieldNoteAwards,
} from "./progress";

function apply(
  events: Parameters<typeof reduceFieldNotesProgress>[1][],
  start = EMPTY_FIELD_NOTES_PROGRESS,
) {
  return events.reduce(
    (progress, event, index) =>
      reduceFieldNotesProgress(progress, event, 1_000 + index).progress,
    start,
  );
}

describe("Field Notes progress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [
      "first-portal",
      {
        type: "portal-activated",
        portalId: "portal:test",
        unitIndex: 0,
        destination: "books",
      },
    ],
    ["photo-finish", { type: "photo-mode-entered" }],
    [
      "heavy-lifting",
      {
        type: "prop-carried",
        propId: "grab:barbell",
        unitIndex: 2,
        massKg: 60,
      },
    ],
    [
      "global-perspective",
      {
        type: "interaction-activated",
        interactionId: "egg:globe",
        unitIndex: 0,
      },
    ],
    ["a-capital-view", { type: "seat-entered" }],
    ["ripple-effect", { type: "coordination-shockwave" }],
    [
      "task-light",
      {
        type: "interaction-activated",
        interactionId: "egg:lamp:4",
        unitIndex: 4,
      },
    ],
    [
      "beacon",
      {
        type: "interaction-activated",
        interactionId: "egg:lamp:floor:6",
        unitIndex: 6,
      },
    ],
    [
      "early-alarm",
      {
        type: "interaction-activated",
        interactionId: "egg:clock:alarm",
        unitIndex: 3,
      },
    ],
    [
      "old-time",
      {
        type: "interaction-activated",
        interactionId: "egg:clock:case",
        unitIndex: 3,
      },
    ],
    [
      "tea-time",
      {
        type: "interaction-activated",
        interactionId: "egg:tea",
        unitIndex: 5,
      },
    ],
    ["spine-cracked", { type: "book-preview-opened" }],
    [
      "behind-the-numbers",
      {
        type: "artifact-opened",
        artifactId: "lift-table",
        collection: "training-analysis",
      },
    ],
    [
      "fireworks-over-the-bay",
      {
        type: "interaction-activated",
        interactionId: "sky:goldengate",
        unitIndex: 0,
      },
    ],
    [
      "crowned",
      {
        type: "interaction-activated",
        interactionId: "sky:salesforce",
        unitIndex: 0,
      },
    ],
    [
      "floor-33",
      {
        type: "interaction-activated",
        interactionId: "sky:jasper",
        unitIndex: 0,
      },
    ],
    ["butterfly-effect", { type: "butterfly-landed-on-held-prop" }],
    ["hole-in-one", { type: "golf-ball-holed", firstShot: true }],
    ["wrong-sport", { type: "golf-prop-struck" }],
    ["long-haul", { type: "prop-carried-far", propId: "grab:mug" }],
    ["full-stack", { type: "dice-stacked" }],
  ] satisfies readonly (readonly [string, FieldNoteEvent])[])(
    "earns %s from its semantic event",
    (id, event) => {
      const progress = reduceFieldNotesProgress(
        EMPTY_FIELD_NOTES_PROGRESS,
        event,
        1_000,
      ).progress;

      expect(progress.earned[id as keyof typeof progress.earned]).toBe(1_000);
    },
  );

  it("earns the grand tour after all seven distinct units", () => {
    const progress = apply(
      [0, 1, 2, 3, 4, 5, 6, 6].map((unitIndex) => ({
        type: "unit-arrived" as const,
        unitIndex,
      })),
    );

    expect(progress.visitedUnits).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(progress.earned["grand-tour"]).toBeDefined();
  });

  it("tracks distinct carried props and their shelves", () => {
    const progress = apply(
      Array.from({ length: 10 }, (_, index) => ({
        type: "prop-carried" as const,
        propId: `prop:${index}`,
        unitIndex: index % 7,
        massKg: 1,
      })),
    );

    expect(progress.earned["curious-hands"]).toBeDefined();
    expect(progress.earned["around-the-room"]).toBeDefined();
    expect(progress.earned.rearranged).toBeDefined();
  });

  it("does not rewrite progress for a repeated semantic event", () => {
    const first = reduceFieldNotesProgress(
      EMPTY_FIELD_NOTES_PROGRESS,
      { type: "unit-arrived", unitIndex: 0 },
      1_000,
    ).progress;
    const repeated = reduceFieldNotesProgress(
      first,
      { type: "unit-arrived", unitIndex: 0 },
      2_000,
    );

    expect(repeated.progress).toBe(first);
    expect(repeated.awarded).toEqual([]);
  });

  it("requires all three shakers and both pixel looks", () => {
    const progress = apply([
      {
        type: "interaction-activated",
        interactionId: "grab:shaker:training",
        unitIndex: 2,
      },
      {
        type: "interaction-activated",
        interactionId: "grab:shaker:training-navy",
        unitIndex: 2,
      },
      {
        type: "interaction-activated",
        interactionId: "grab:shaker:training-amber",
        unitIndex: 2,
      },
      { type: "pixel-look-entered", look: "levels" },
      { type: "pixel-look-entered", look: "palette" },
    ]);

    expect(progress.earned["shake-well"]).toBeDefined();
    expect(progress.earned["another-resolution"]).toBeDefined();
  });

  it("counts portal destinations, not portal props, toward the open house", () => {
    const sameDestination = apply(
      Array.from({ length: 9 }, (_, index) => ({
        type: "portal-activated" as const,
        portalId: `link:projects:dice:${index}`,
        unitIndex: 3,
        destination: "liarsdice",
      })),
    );
    expect(sameDestination.portalDestinations).toEqual(["liarsdice"]);
    expect(sameDestination.earned["open-house"]).toBeUndefined();

    const spread = apply(
      Array.from({ length: 8 }, (_, index) => ({
        type: "portal-activated" as const,
        portalId: `portal:${index}`,
        unitIndex: index % 7,
        destination: `https://example.com/${index}`,
      })),
    );
    expect(spread.earned["open-house"]).toBeDefined();
  });

  it("earns the philatelist after five distinct stamps are rearranged", () => {
    const fourStamps = apply(
      ["beacon", "beacon", "tea-time", "old-time", "task-light"].map(
        (noteId) => ({ type: "stamp-placed" as const, noteId }),
      ),
    );
    expect(fourStamps.placedStamps).toEqual([
      "beacon",
      "tea-time",
      "old-time",
      "task-light",
    ]);
    expect(fourStamps.earned.philatelist).toBeUndefined();

    const fifth = reduceFieldNotesProgress(
      fourStamps,
      { type: "stamp-placed", noteId: "early-alarm" },
      2_000,
    );
    expect(fifth.awarded).toEqual(["philatelist"]);
    expect(fifth.progress.earned.philatelist).toBe(2_000);
  });

  it("ignores stamp placements for unknown discovery IDs", () => {
    const progress = apply([
      { type: "stamp-placed", noteId: "invented" },
      { type: "stamp-placed", noteId: "beacon" },
    ]);

    expect(progress.placedStamps).toEqual(["beacon"]);
  });

  it("drops unknown persisted placed stamps", () => {
    const progress = parseFieldNotesProgress(
      JSON.stringify({
        version: 1,
        placedStamps: ["beacon", "invented", 7],
      }),
    );

    expect(progress.placedStamps).toEqual(["beacon"]);
  });

  it("earns the regular on a later local day, never the first", () => {
    const firstDay = apply([
      { type: "session-started", day: "2026-08-25" },
      { type: "session-started", day: "2026-08-25" },
    ]);
    expect(firstDay.firstVisitDay).toBe("2026-08-25");
    expect(firstDay.earned["the-regular"]).toBeUndefined();

    const returned = reduceFieldNotesProgress(
      firstDay,
      { type: "session-started", day: "2026-08-26" },
      2_000,
    ).progress;
    expect(returned.earned["the-regular"]).toBe(2_000);
  });

  it("awards the full journal alongside the final other discovery", () => {
    const allButOne: FieldNotesProgress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: Object.fromEntries(
        FIELD_NOTES.filter(
          (note) => note.id !== "full-journal" && note.id !== "wrong-sport",
        ).map((note) => [note.id, 500]),
      ),
    };

    const finale = reduceFieldNotesProgress(
      allButOne,
      { type: "golf-prop-struck" },
      3_000,
    );

    expect(finale.awarded).toEqual(["wrong-sport", "full-journal"]);
    expect(finale.progress.earned["full-journal"]).toBe(3_000);
  });

  it("requires photographs from all five authored collections", () => {
    const progress = apply(
      ["about", "training", "systems", "projects", "talks"].map((unit) => ({
        type: "artifact-opened" as const,
        artifactId: `${unit}:photo`,
        collection: `${unit}-photos` as
          | "about-photos"
          | "training-photos"
          | "systems-photos"
          | "projects-photos"
          | "talks-photos",
      })),
    );

    expect(progress.earned["family-album"]).toBeDefined();
  });

  it("sanitizes unknown and malformed persisted data", () => {
    const progress = parseFieldNotesProgress(
      JSON.stringify({
        version: 1,
        earned: { "grand-tour": 123, invented: 456, crowned: "yesterday" },
        visitedUnits: [0, "1", 2],
        carriedProps: { mug: 5, bad: "six" },
      }),
    );

    expect(progress.earned).toEqual({ "grand-tour": 123 });
    expect(progress.visitedUnits).toEqual([0, 2]);
    expect(progress.carriedProps).toEqual({ mug: 5 });
  });

  it("previews a notification without earning the discovery", () => {
    const notifications: string[][] = [];
    const unsubscribe = subscribeFieldNoteAwards((ids) =>
      notifications.push([...ids]),
    );

    expect(previewFieldNoteAward("first-portal")).toBe(true);
    unsubscribe();

    expect(notifications).toEqual([["first-portal"]]);
  });

  it("rejects notification previews for unknown discovery IDs", () => {
    expect(previewFieldNoteAward("invented" as never)).toBe(false);
  });

  it("persists and clears the all-found debug override", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    setAllFieldNotesFound(true, 5_000);
    const persisted = JSON.parse([...values.values()][0]!) as {
      earned: Record<string, number>;
    };

    expect(Object.keys(persisted.earned)).toHaveLength(FIELD_NOTES.length);
    expect(new Set(Object.values(persisted.earned))).toEqual(new Set([5_000]));

    values.set(
      FIELD_NOTE_PLACEMENT_STORAGE_KEY,
      JSON.stringify({ beacon: { x: 0.1, y: 0, tilt: 1 } }),
    );
    setAllFieldNotesFound(false);
    expect(values.size).toBe(0);
  });
});
