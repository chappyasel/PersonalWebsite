import { describe, expect, it } from "vitest";

import { FIELD_NOTES, FIELD_NOTE_RARITIES } from "./catalog";

describe("Field Notes catalog", () => {
  it("keeps the approved rarity curve", () => {
    const counts = Object.fromEntries(
      FIELD_NOTE_RARITIES.map((rarity) => [
        rarity,
        FIELD_NOTES.filter((note) => note.rarity === rarity).length,
      ]),
    );

    expect(counts).toEqual({
      Common: 12,
      Uncommon: 9,
      Rare: 6,
      Legendary: 4,
    });
  });

  it("reserves Legendary for the completion- and skill-heavy discoveries", () => {
    expect(
      FIELD_NOTES.filter((note) => note.rarity === "Legendary").map(
        (note) => note.id,
      ),
    ).toEqual([
      "around-the-room",
      "hole-in-one",
      "full-stack",
      "full-journal",
    ]);
  });

  it("keeps unusual one-off interactions below the completion tier", () => {
    expect(
      Object.fromEntries(
        ["grand-tour", "butterfly-effect", "wrong-sport"].map((id) => {
          const note = FIELD_NOTES.find((candidate) => candidate.id === id);
          return [id, note?.rarity];
        }),
      ),
    ).toEqual({
      "grand-tour": "Rare",
      "butterfly-effect": "Uncommon",
      "wrong-sport": "Uncommon",
    });
  });
});
