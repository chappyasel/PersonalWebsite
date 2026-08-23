import { describe, expect, it } from "vitest";

import {
  SCENE_LAYOUT_EDITOR_SENTINEL,
  createSceneLayoutDraft,
  isSceneLayoutDraft,
} from "./sceneLayoutDraft";

const record = {
  id: "about-print",
  unitIndex: 1,
  label: "About print",
  authored: [0, 0, 0] as const,
  preview: [0.1, 0, 0.2] as const,
  delta: [0.1, 0, 0.2] as const,
  authoredRotation: [0, 0, 0] as const,
  previewRotation: [0, 0.2, 0] as const,
  rotationDelta: [0, 0.2, 0] as const,
};

describe("scene layout draft", () => {
  it("creates a versioned, timestamped handoff", () => {
    expect(
      createSceneLayoutDraft([record], "2026-08-22T20:00:00.000Z"),
    ).toEqual({
      sentinel: SCENE_LAYOUT_EDITOR_SENTINEL,
      savedAt: "2026-08-22T20:00:00.000Z",
      records: [record],
    });
  });

  it("rejects malformed and oversized writes", () => {
    const draft = createSceneLayoutDraft([record]);
    expect(isSceneLayoutDraft(draft)).toBe(true);
    expect(isSceneLayoutDraft({ ...draft, savedAt: "not-a-date" })).toBe(false);
    expect(
      isSceneLayoutDraft({
        ...draft,
        records: Array.from({ length: 33 }, () => record),
      }),
    ).toBe(false);
    expect(
      isSceneLayoutDraft({
        ...draft,
        records: [{ ...record, preview: [Number.NaN, 0, 0] }],
      }),
    ).toBe(false);
  });
});
