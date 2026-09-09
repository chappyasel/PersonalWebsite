import { describe, expect, it } from "vitest";

import { anchorSlug, textOfChildren, uniqueAnchor } from "./anchors";

describe("anchorSlug", () => {
  it("drops the icon, a trailing parenthetical, punctuation, and apostrophes", () => {
    expect(anchorSlug("🧠 Knowledge")).toBe("knowledge");
    expect(anchorSlug("♾️ Deep Think Weeks (72h)")).toBe("deep-think-weeks");
    expect(anchorSlug("Chappy’s Book Notes:")).toBe("chappys-book-notes");
    expect(anchorSlug(":sunsama: Sunsama")).toBe("sunsama");
    expect(anchorSlug("#️⃣ Log a Daily Scorecard.")).toBe(
      "log-a-daily-scorecard",
    );
  });
  it("keeps a leading number that is not an icon", () => {
    expect(anchorSlug("7 Habits")).toBe("7-habits");
  });
});

describe("uniqueAnchor", () => {
  it("suffixes a repeat and never hands out an empty id", () => {
    const taken = new Set<string>();
    expect(uniqueAnchor("notes", taken)).toBe("notes");
    expect(uniqueAnchor("notes", taken)).toBe("notes-2");
    expect(uniqueAnchor("", taken)).toBe("section");
  });
});

describe("textOfChildren", () => {
  it("reads strings through nested elements", () => {
    const tree = [
      "Chapter ",
      { props: { children: ["3", { props: { children: ": Fire" } }] } },
    ];
    expect(textOfChildren(tree)).toBe("Chapter 3: Fire");
  });
});
