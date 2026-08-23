import { describe, expect, it } from "vitest";

import {
  clearRecentResults,
  readRecentResults,
  recordRecentResult,
} from "./recents";
import type { SearchResult } from "./types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function result(id: string, group: SearchResult["group"] = "destinations") {
  return {
    id,
    kind: "destination",
    group,
    label: `Result ${id}`,
    href: `/result/${id}`,
    matchKind: "exact",
    score: 1_000,
    excerpt: "must not persist",
  } satisfies SearchResult;
}

describe("Universal Search Recent results", () => {
  it("stores a bounded, newest-first, deduplicated list", () => {
    const storage = new MemoryStorage();

    for (let index = 0; index < 10; index += 1) {
      recordRecentResult(storage, result(String(index)), index);
    }
    recordRecentResult(storage, result("4"), 20);

    const recents = readRecentResults(storage);
    expect(recents).toHaveLength(8);
    expect(recents[0]).toEqual({
      id: "4",
      kind: "destination",
      label: "Result 4",
      href: "/result/4",
      selectedAt: 20,
    });
    expect(recents.some((recent) => "excerpt" in recent)).toBe(false);
  });

  it("never persists protected Dad results", () => {
    const storage = new MemoryStorage();

    recordRecentResult(storage, result("dad-entry", "dad"), 1);

    expect(readRecentResults(storage)).toEqual([]);
  });

  it("recovers from malformed storage and clears cleanly", () => {
    const storage = new MemoryStorage();
    storage.setItem("universal-search-recents:v1", "not json");

    expect(readRecentResults(storage)).toEqual([]);
    recordRecentResult(storage, result("home"), 1);
    clearRecentResults(storage);
    expect(readRecentResults(storage)).toEqual([]);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "//evil.example/search",
    "https://youtube.com/watch?v=private",
    "https://youtu.be/private",
  ])("rejects an unsafe or excluded stored destination: %s", (href) => {
    const storage = new MemoryStorage();
    storage.setItem(
      "universal-search-recents:v1",
      JSON.stringify({
        version: 1,
        items: [
          {
            id: "unsafe",
            kind: "content",
            label: "Unsafe",
            href,
            selectedAt: 1,
          },
        ],
      }),
    );

    expect(readRecentResults(storage)).toEqual([]);
  });

  it("keeps safe relative and HTTPS destinations", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "universal-search-recents:v1",
      JSON.stringify({
        version: 1,
        items: [
          {
            id: "internal",
            kind: "content",
            label: "Internal",
            href: "/books/example",
            selectedAt: 2,
          },
          {
            id: "external",
            kind: "content",
            label: "External",
            href: "https://medium.com/example",
            selectedAt: 1,
          },
        ],
      }),
    );

    expect(readRecentResults(storage)).toHaveLength(2);
  });
});
