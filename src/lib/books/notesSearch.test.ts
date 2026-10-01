import { describe, expect, it } from "vitest";

import {
  NOTE_MATCH_END as E,
  NOTE_SEARCH_MAX_QUERY_LENGTH,
  NOTE_MATCH_START as S,
  noteExcerptSegments,
  noteSearchQuery,
} from "./notesSearch";

describe("noteSearchQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(noteSearchQuery("  compound \n interest ")).toBe(
      "compound interest",
    );
  });

  it("declines a query too short to search for", () => {
    expect(noteSearchQuery("")).toBeNull();
    expect(noteSearchQuery(" a ")).toBeNull();
  });

  it("drops control characters a caller could send", () => {
    expect(noteSearchQuery("dopa\u0000mine\u0001\u0002")).toBe("dopa mine");
  });

  it("caps the length", () => {
    expect(noteSearchQuery("x".repeat(500))).toHaveLength(
      NOTE_SEARCH_MAX_QUERY_LENGTH,
    );
  });
});

describe("noteExcerptSegments", () => {
  it("splits a headline into plain and matched segments", () => {
    expect(
      noteExcerptSegments(
        `Intellectual work is like ${S}compound${E} ${S}interest${E}.`,
      ),
    ).toEqual([
      { text: "Intellectual work is like ", match: false },
      { text: "compound", match: true },
      { text: " ", match: false },
      { text: "interest", match: true },
      { text: ".", match: false },
    ]);
  });

  it("strips the Markdown the notes are written in", () => {
    const segments = noteExcerptSegments(
      `# Notes\n\n- Raise for **${S}12${E}**-24 months\n- Too much \\$\\$ is a [risk](https://example.com)`,
    );
    expect(segments?.map((segment) => segment.text).join("")).toBe(
      "Notes · Raise for 12-24 months · Too much $$ is a risk",
    );
    expect(segments?.filter((segment) => segment.match)).toEqual([
      { text: "12", match: true },
    ]);
  });

  it("leads a passage that opens mid-sentence with an ellipsis", () => {
    expect(noteExcerptSegments(`exposure to ${S}dopamine${E}`)?.[0]?.text).toBe(
      "…exposure to ",
    );
    expect(noteExcerptSegments(`${S}dopamine${E} signals surprise`)).toEqual([
      { text: "…", match: false },
      { text: "dopamine", match: true },
      { text: " signals surprise", match: false },
    ]);
  });

  it("cuts a long lead-in at a word so the match stays in view", () => {
    const segments = noteExcerptSegments(
      `Practice relentlessly, because even Steve Jobs spent hundreds of hours rehearsing. Deliver something novel to trigger ${S}dopamine${E} and teach`,
    );
    expect(segments?.[0]?.text).toBe(
      "…rehearsing. Deliver something novel to trigger ",
    );
    expect(segments?.[1]).toEqual({ text: "dopamine", match: true });
  });

  it("does not open on a bullet separator or keep a hard-break backslash", () => {
    const segments = noteExcerptSegments(
      `- Maintain willingness to withdraw from the deal\\\n- Attention through novelty and tension\n- ${S}Dopamine${E} system\\ <br>\n- Scale-free`,
    );
    const text = segments?.map((segment) => segment.text).join("");
    expect(text).toBe(
      "…deal · Attention through novelty and tension · Dopamine system · Scale-free",
    );
  });

  it("keeps characters Notion escaped", () => {
    const text = (headline: string) =>
      noteExcerptSegments(headline)
        ?.map((segment) => segment.text)
        .join("");
    expect(text(`- \\~75% of ${S}people${E} breathe through the mouth`)).toBe(
      "~75% of people breathe through the mouth",
    );
    expect(
      text(`Notes \\<skipped from 27:00 in to ${S}chapter${E}\\> two`),
    ).toBe("Notes <skipped from 27:00 in to chapter> two");
  });

  it("drops a link or image the headline cut in half", () => {
    const text = (headline: string) =>
      noteExcerptSegments(headline)
        ?.map((segment) => segment.text)
        .join("");
    expect(
      text(
        `rating](https://www.amazon.com/review/R1?ASIN=1) A ${S}habit${E} loop`,
      ),
    ).toBe("A habit loop");
    expect(text(`A ${S}habit${E} loop · ![Untitled.jpeg`)).toBe("A habit loop");
    expect(
      text(`A ${S}habit${E} from [Atomic Habits](https://app.notion.com/p/5f9`),
    ).toBe("A habit from Atomic Habits");
    expect(
      text(`See [Atomic Habits](https://example.com) on ${S}habit${E}`),
    ).toBe("See Atomic Habits on habit");
    expect(text(`See [the ${S}habit${E} loop](https://example.com) here`)).toBe(
      "See the habit loop here",
    );
  });

  it("returns null when the notes never mention the query", () => {
    expect(
      noteExcerptSegments("Summary of a book matched by title"),
    ).toBeNull();
  });
});
