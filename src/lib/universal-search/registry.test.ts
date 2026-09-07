import { describe, expect, it } from "vitest";

import { COMMAND_ENTRIES } from "./registry";

describe("Universal Search command registry", () => {
  it("uses unique stable IDs", () => {
    const ids = COMMAND_ENTRIES.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("promotes the agreed primary destinations", () => {
    const promotedLabels = COMMAND_ENTRIES.filter(
      (entry) => entry.kind === "destination" && entry.promoted,
    ).map((entry) => entry.label);

    expect(promotedLabels).toEqual([
      "Home",
      "Book Notes",
      "Manual",
      "Routine",
      "Systems",
      "Weightlifting",
      "About",
      "Projects",
      "Musings",
    ]);
  });

  it("keeps Liar's Dice searchable but unpromoted", () => {
    expect(COMMAND_ENTRIES).toContainEqual(
      expect.objectContaining({
        id: "destination-liars-dice",
        kind: "destination",
        promoted: false,
      }),
    );
  });

  it("excludes Golf, YouTube, and YouTube-backed talks from the registry", () => {
    const registryText = JSON.stringify(COMMAND_ENTRIES).toLowerCase();

    expect(registryText).not.toContain("golf");
    expect(registryText).not.toContain("youtube");
    expect(registryText).not.toContain("featured talks");
  });

  it("contains only the agreed first-release actions", () => {
    const actionIds = COMMAND_ENTRIES.filter(
      (entry) => entry.kind === "action",
    ).map((entry) => entry.actionId);

    expect(actionIds).toEqual([
      "theme-light",
      "theme-dark",
      "theme-system",
      "font-georgia",
      "font-literata",
      "font-system",
      "recents-clear",
    ]);
  });
});
