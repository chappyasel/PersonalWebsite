import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { norms } from "~/lib/personalities/data";

import ChangesView from "./ChangesView";
import Charts from "./Charts";
import DirectCompare from "./DirectCompare";
import type { ScoreRecord, Snapshot } from "./model";
import { recordFor, recordsByDate } from "./model";

const result = (
  id: string,
  takenOn: string | null,
  openness: number,
): ScoreRecord => ({
  id,
  takenOn,
  source: "manual",
  label: id,
  ref: "",
  scores: {
    Openness: openness,
    Conscientiousness: 70,
    Extraversion: 70,
    Agreeableness: 70,
    Neuroticism: 70,
  },
});
const data: Snapshot = {
  norms,
  sources: [],
  people: [
    {
      id: "one",
      name: "First",
      group: "You",
      records: [
        result("Undated", null, 120),
        result("Recent", "2026-01-01", 90),
        result("Early", "2023-01-01", 60),
      ],
    },
    {
      id: "two",
      name: "Second",
      group: "Friends",
      records: [result("Other recent", "2026-01-01", 80)],
    },
  ],
};

describe("direct analysis views", () => {
  it("opens the main view with all five trait curves", () => {
    const html = renderToStaticMarkup(
      <Charts
        data={data}
        variant="A"
        initialFocus="one"
        onPersonFocus={vi.fn()}
        onAssessment={vi.fn()}
      />,
    );
    expect(html.match(/reference bell curve\. Dots show/g)).toHaveLength(5);
  });
  it("keeps date options newest first without changing the selected result", () => {
    const person = data.people[0]!;
    const expected = ["Recent", "Early", "Undated"];
    expect(recordsByDate(person.records).map((r) => r.id)).toEqual(expected);
    expect(recordFor(person, "")?.id).toBe("Undated");
    const olderSelected = {
      ...person,
      records: [person.records[2]!, person.records[0]!, person.records[1]!],
    };
    expect(recordsByDate(olderSelected.records).map((r) => r.id)).toEqual(
      expected,
    );
    expect(recordFor(olderSelected, "")?.id).toBe("Early");
  });
  it("keeps same-date results in a stable order and handles month-only dates", () => {
    const records = [
      result("b", "2025-08", 80),
      result("a", "2025-08", 80),
      result("day", "2025-08-27", 80),
      result("older", "2025-07-31", 80),
    ];
    expect(recordsByDate(records).map((r) => r.id)).toEqual([
      "day",
      "a",
      "b",
      "older",
    ]);
    expect(recordsByDate([...records].reverse())).toEqual(
      recordsByDate(records),
    );
  });
  it("compares earliest and latest dated results regardless of selected record order", () => {
    const html = renderToStaticMarkup(
      <ChangesView data={data} personId="one" onPerson={vi.fn()} />,
    );
    expect(html).toContain("30 points higher");
    expect(html).toContain("From Early to Recent");
    expect(html).not.toContain("120 / 120 · Undated");
  });
  it("compares the explicitly selected records and reports the correct higher person", () => {
    const html = renderToStaticMarkup(
      <DirectCompare
        data={data}
        personId="one"
        onPerson={vi.fn()}
        onAssessment={vi.fn()}
      />,
    );
    expect(html).toContain("First scored 40 points higher");
    expect(html).toContain("Difference is Second minus First");
    expect(html).toContain("2.78 standard deviations");
    expect(html).toContain("percentile points");
    expect(html).toContain("Estimated percentile");
    expect(
      html.match(/both results on the reference bell curve/g),
    ).toHaveLength(5);
  });
  it("keeps shared reference metrics and ranks the largest and smallest standardized gaps", () => {
    const html = renderToStaticMarkup(
      <DirectCompare
        data={data}
        personId="one"
        onPerson={vi.fn()}
        onAssessment={vi.fn()}
        readOnly
      />,
    );
    expect(html).toContain("Biggest gap");
    expect(html).toContain("Smallest gap");
    expect(html).toContain("2.78 SD · 40 points");
    expect(html).toContain("0.00 SD · 0 points");
    expect(html).toContain("Conscientiousness");
    expect(html).toContain("99.8");
    expect(html).toContain("+2.83");
    expect(html.match(/Est. percentile/g)).toHaveLength(5);
    expect(html).not.toContain("combobox");
  });

  it("explains when a second compatible profile is missing", () => {
    const html = renderToStaticMarkup(
      <DirectCompare
        data={{ ...data, people: [data.people[0]!] }}
        personId="one"
        onPerson={vi.fn()}
        onAssessment={vi.fn()}
      />,
    );
    expect(html).toContain("at least two people");
  });
});
