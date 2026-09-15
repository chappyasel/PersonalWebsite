import {
  KeyOutsidePrefixError,
  PREFIX,
  assetKey,
  confine,
  headKey,
  receiptKey,
  revisionKey,
} from "./keys";
import { describe, expect, it } from "vitest";

describe("prefix confinement", () => {
  it("keeps every builder under the feature's prefix", () => {
    expect(assetKey("abc123")).toBe(`${PREFIX}assets/abc123.png`);
    expect(revisionKey("book-the-body", 2)).toBe(`${PREFIX}work/book-the-body/rev-2.json`);
    expect(headKey("book-the-body")).toBe(`${PREFIX}work/book-the-body/head.json`);
    expect(receiptKey("book-the-body", 2, 1)).toBe(
      `${PREFIX}receipts/book-the-body/2-1.json`,
    );
  });

  it("refuses traversal in a work id", () => {
    // The bucket also holds the weightlifting backup, so this matters.
    expect(() => revisionKey("../../weightlifting", 1)).toThrow(/invalid workId/);
    expect(() => headKey("..")).toThrow(/invalid workId/);
    expect(() => assetKey("../secret")).toThrow(/invalid sha256/);
  });

  it("refuses separators and absolute keys", () => {
    expect(() => confine("/etc/passwd")).toThrow(KeyOutsidePrefixError);
    expect(() => confine("other-prefix/thing.json")).toThrow(KeyOutsidePrefixError);
    expect(() => confine(`${PREFIX}a//b`)).toThrow(KeyOutsidePrefixError);
    expect(() => confine(`${PREFIX}a/../../b`)).toThrow(KeyOutsidePrefixError);
    expect(() => confine(`${PREFIX}a\\b`)).toThrow(KeyOutsidePrefixError);
  });

  it("refuses a work id carrying a slash", () => {
    expect(() => headKey("book/../../weight-log")).toThrow(/invalid workId/);
  });

  it("refuses nonsense revision and attempt numbers", () => {
    expect(() => revisionKey("book-x", 0)).toThrow(/invalid revision/);
    expect(() => revisionKey("book-x", -1)).toThrow(/invalid revision/);
    expect(() => revisionKey("book-x", 1.5)).toThrow(/invalid revision/);
    expect(() => receiptKey("book-x", 1, 0)).toThrow(/invalid attempt/);
  });

  it("accepts every work id the real catalog produces", () => {
    for (const name of [
      "book-the-mom-test",
      "book-101-essays-that-will-change-the-way-you-think",
      "book-1984",
      "book-7-habits-of-highly-effective-people",
    ]) {
      expect(headKey(name).startsWith(PREFIX)).toBe(true);
    }
  });
});
