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

    // 2026-09-07: The Long Game adds one Rare cross-room golf discovery.
    expect(counts).toEqual({
      Common: 14,
      Uncommon: 11,
      Rare: 12,
      Legendary: 5,
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
      "reality-stack",
      "full-journal",
    ]);
  });

  it("keeps the album-side discovery in the deliberate-habit tier", () => {
    const philatelist = FIELD_NOTES.find((note) => note.id === "philatelist");

    expect(philatelist).toMatchObject({
      title: "Philatelist",
      rarity: "Uncommon",
      artwork: "stamp",
      hidden: false,
      hint: "Even these stamps aren't glued down.",
      foundCopy: "Rearranged five stamps in this album.",
    });
  });

  it("keeps the capstone as the final catalog entry", () => {
    expect(FIELD_NOTES.at(-1)?.id).toBe("full-journal");
  });

  it("pairs the visible Vision Pro ride with its hidden pixel combination", () => {
    expect(
      FIELD_NOTES.filter((note) =>
        ["future-perfect", "reality-distortion-field"].includes(note.id),
      ),
    ).toEqual([
      {
        id: "future-perfect",
        title: "Future Perfect",
        rarity: "Common",
        artwork: "vision",
        hidden: false,
        hint: "The headset on About is more than a keepsake.",
        foundCopy: "Put on Apple Vision Pro and entered the retrowave ride.",
      },
      {
        id: "reality-distortion-field",
        title: "Reality Distortion Field",
        rarity: "Rare",
        artwork: "retro-vision",
        hidden: true,
        hint: null,
        foundCopy:
          "Entered the Vision Pro ride with an 8-bit or 16-bit finish active.",
      },
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

  it("describes the About-to-golf handoff as a visible cross-room discovery", () => {
    expect(FIELD_NOTES.find((note) => note.id === "the-long-game")).toEqual({
      id: "the-long-game",
      title: "The Long Game",
      rarity: "Rare",
      artwork: "golf-journey",
      hidden: false,
      hint: "A golf ball on About belongs somewhere farther down the room.",
      foundCopy: "Carried an About golf ball to the hitting bay and struck it.",
    });
  });

  it("recognizes every authored reality and reserves Legendary for their full stack", () => {
    expect(
      FIELD_NOTES.filter((note) =>
        ["night-shift", "redline", "fore-sight", "reality-stack"].includes(
          note.id,
        ),
      ).map(({ id, rarity, hidden }) => ({ id, rarity, hidden })),
    ).toEqual([
      { id: "night-shift", rarity: "Rare", hidden: true },
      { id: "redline", rarity: "Rare", hidden: true },
      { id: "fore-sight", rarity: "Rare", hidden: true },
      { id: "reality-stack", rarity: "Legendary", hidden: true },
    ]);
  });
});
