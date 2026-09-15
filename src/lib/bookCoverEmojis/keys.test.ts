import {
  KeyOutsidePrefixError,
  PREFIX,
  catalogKey,
  confine,
  pageKey,
  sourceKey,
} from "./keys";
import { describe, expect, it } from "vitest";

describe("prefix confinement", () => {
  it("keeps every builder under the feature's prefix", () => {
    expect(sourceKey("book-the-body")).toBe(
      `${PREFIX}sources/book-the-body.json`,
    );
    expect(pageKey("340c5ab0-d88d-8055-b415-ce051e3c6903")).toBe(
      `${PREFIX}pages/340c5ab0-d88d-8055-b415-ce051e3c6903.json`,
    );
    expect(catalogKey()).toBe(`${PREFIX}index/catalog.json`);
  });

  it("refuses traversal in a work or page id", () => {
    // The bucket also holds the weightlifting backup, so this matters.
    expect(() => sourceKey("../../weightlifting")).toThrow(/invalid workId/);
    expect(() => sourceKey("..")).toThrow(/invalid workId/);
    expect(() => pageKey("../secret")).toThrow(/invalid notionId/);
  });

  it("refuses separators and absolute keys", () => {
    expect(() => confine("/etc/passwd")).toThrow(KeyOutsidePrefixError);
    expect(() => confine("other-prefix/thing.json")).toThrow(KeyOutsidePrefixError);
    expect(() => confine(`${PREFIX}a//b`)).toThrow(KeyOutsidePrefixError);
    expect(() => confine(`${PREFIX}a/../../b`)).toThrow(KeyOutsidePrefixError);
    expect(() => confine(`${PREFIX}a\\b`)).toThrow(KeyOutsidePrefixError);
  });

  it("refuses a work id carrying a slash", () => {
    expect(() => sourceKey("book/../../weight-log")).toThrow(/invalid workId/);
  });

  it("accepts every work id the real catalog produces", () => {
    for (const name of [
      "book-the-mom-test",
      "book-101-essays-that-will-change-the-way-you-think",
      "book-1984",
      "book-7-habits-of-highly-effective-people",
    ]) {
      expect(sourceKey(name).startsWith(PREFIX)).toBe(true);
    }
  });
});
