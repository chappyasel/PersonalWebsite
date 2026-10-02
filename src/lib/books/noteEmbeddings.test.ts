import { describe, expect, it, vi } from "vitest";

import { passagesOutdated } from "./noteEmbeddings";

vi.mock("~/server/db", () => ({ db: {} }));

const chunk = (heading: string | null, text: string) => ({
  section: "Notes",
  heading,
  anchor: null,
  text,
});

describe("passagesOutdated", () => {
  const stored = [
    { heading: "1: Trust", content: "- Built slowly" },
    { heading: "2: Doubt", content: "- Broken fast" },
  ];

  it("keeps passages whose text still matches the notes", () => {
    expect(
      passagesOutdated(stored, [
        chunk("1: Trust", "- Built slowly"),
        chunk("2: Doubt", "- Broken fast"),
      ]),
    ).toBe(false);
  });

  it("flags passages once the notes say something else", () => {
    expect(
      passagesOutdated(stored, [
        chunk("1: Trust", "- Built slowly"),
        chunk("2: Doubt", "- Broken fast, rebuilt slower"),
      ]),
    ).toBe(true);
    expect(
      passagesOutdated(stored, [chunk("1: Trust", "- Built slowly")]),
    ).toBe(true);
    expect(
      passagesOutdated(stored, [
        chunk("1: Trust", "- Built slowly"),
        chunk("2: Distrust", "- Broken fast"),
      ]),
    ).toBe(true);
  });
});
