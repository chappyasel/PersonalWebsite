import { describe, expect, it } from "vitest";

import {
  universalSearchOpenedProperties,
  universalSearchProviderSettledProperties,
  universalSearchResultSelectedProperties,
  universalSearchZeroResultsProperties,
} from "~/lib/analytics";

describe("Universal Search analytics payloads", () => {
  it("contains only allowlisted operational properties", () => {
    expect(universalSearchOpenedProperties()).toEqual({ source: "keyboard" });
    expect(
      universalSearchProviderSettledProperties({
        provider: "books",
        durationMs: 42.8,
        resultCount: 3,
        outcome: "success",
      }),
    ).toEqual({
      provider: "books",
      duration_ms: 43,
      result_count: 3,
      outcome: "success",
    });
    expect(universalSearchZeroResultsProperties(3)).toEqual({
      eligible_provider_count: 3,
    });
    expect(
      universalSearchResultSelectedProperties({
        group: "books",
        kind: "content",
        rank: 1,
        matchKind: "body",
      }),
    ).toEqual({
      group: "books",
      kind: "content",
      rank: 1,
      match_kind: "body",
    });
  });

  it("cannot carry query, title, URL, excerpt, or result ID fields", () => {
    const payloads = [
      universalSearchOpenedProperties(),
      universalSearchProviderSettledProperties({
        provider: "dad",
        durationMs: 10,
        resultCount: 1,
        outcome: "success",
      }),
      universalSearchZeroResultsProperties(1),
      universalSearchResultSelectedProperties({
        group: "dad",
        kind: "content",
        rank: 0,
        matchKind: "exact",
      }),
    ];

    const serialized = JSON.stringify(payloads).toLowerCase();
    for (const forbidden of ["query", "title", "url", "excerpt", "result_id"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
