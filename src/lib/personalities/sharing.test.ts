import { describe, expect, it } from "vitest";

import type { Assessment, LibraryPerson } from "./data";
import { anonymousContext, validateShare } from "./sharing";

const result = (
  personId: string,
  takenOn: string | null,
  openness: number,
  conscientiousness: number,
): Assessment => ({
  id: `${personId}-${takenOn}`,
  personId,
  takenOn,
  addedAt: "2026-01-01",
  source: "private-source",
  externalResultId: "private-code",
  sourceReference: "private-reference",
  testVersion: "ipip-120",
  scoreKind: "raw",
  scoreMax: 120,
  scores: {
    Openness: openness,
    Conscientiousness: conscientiousness,
    Extraversion: 70,
    Agreeableness: 80,
    Neuroticism: 50,
  },
  notes: "private-notes",
  facets: [],
});
const person = (
  id: string,
  group: LibraryPerson["group"],
  assessments: Assessment[],
): LibraryPerson => ({
  id,
  name: `Secret ${id}`,
  group,
  createdAt: "2026-01-01",
  assessments,
});

describe("unnamed share context", () => {
  it("uses one latest compatible result per other friend or family member and unlinks the traits", () => {
    const people = [
      person("named", "Friends", [
        result("named", "2025-01", 110, 110),
        result("named", "2026-01", 120, 120),
      ]),
      person("friend", "Friends", [
        result("friend", null, 100, 100),
        result("friend", "2024-01", 90, 90),
        result("friend", "2025-01", 40, 100),
        {
          ...result("friend", "2026-01", 99, 99),
          testVersion: "percentage",
          scoreKind: "percentage" as const,
          scoreMax: 100 as const,
        },
      ]),
      person("family", "Family", [result("family", "2025-01", 100, 40)]),
      person("owner", "You", [result("owner", "2026-01", 120, 120)]),
      person("incompatible", "Family", [
        { ...result("incompatible", "2026-01", 99, 99), testVersion: "other" },
      ]),
    ];
    const context = anonymousContext(people, new Set(["named"]));
    expect(context).toEqual({
      count: 2,
      scores: {
        Openness: [40, 100],
        Conscientiousness: [40, 100],
        Extraversion: [70, 70],
        Agreeableness: [80, 80],
        Neuroticism: [50, 50],
      },
    });
    expect(anonymousContext([...people].reverse(), new Set(["named"]))).toEqual(
      context,
    );
    for (const secret of [
      "Secret",
      "named",
      "friend",
      "family",
      "private",
      "2025",
      "personId",
      "takenOn",
    ])
      expect(JSON.stringify(context)).not.toContain(secret);
  });

  it("requires an explicit boolean and leaves older requests without context", () => {
    const input = {
      results: [{ assessmentId: "one", label: "One" }],
      includeDates: true,
      expiresInDays: 30,
    };
    expect(validateShare(input).includeAnonymous).toBe(false);
    expect(
      validateShare({ ...input, includeAnonymous: true }).includeAnonymous,
    ).toBe(true);
    expect(() => validateShare({ ...input, includeAnonymous: "true" })).toThrow(
      "Choose whether",
    );
  });
});
