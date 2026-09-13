import { afterEach, expect, it, vi } from "vitest";

import { isMusingPageChange, prototypeDestination } from "./navigation";

afterEach(() => vi.unstubAllEnvs());
it("distinguishes reading documents without treating feeds or the same pathname as a page change", () => {
  expect(isMusingPageChange("/musings", "/musings/ai-stack")).toBe(true);
  expect(isMusingPageChange("/musings/ai-stack", "/musings/apple-way")).toBe(
    true,
  );
  expect(isMusingPageChange("/musings/ai-stack", "/musings")).toBe(true);
  expect(isMusingPageChange("/musings", "/musings/")).toBe(false);
  expect(isMusingPageChange("/books", "/books/behave")).toBe(false);
  expect(isMusingPageChange("/musings", "/musings/feed.xml")).toBe(false);
  expect(
    prototypeDestination("/musings/feed.xml", "http://localhost:3017/musings"),
  ).toBeNull();
});
it.each([
  [
    "http://localhost:3001/",
    "http://127.0.0.1:3001/weightlifting",
    "http://127.0.0.1:3001/",
  ],
  [
    "https://www.chappyasel.com/",
    "http://localhost:3001/weightlifting",
    "http://localhost:3001/",
  ],
  [
    "http://weightlifting.localhost:3001/",
    "http://localhost:3001/#training",
    "http://localhost:3001/weightlifting",
  ],
  [
    "http://books.localhost:3001/?tags=Psychology",
    "http://localhost:3001/",
    "http://localhost:3001/books?tags=Psychology",
  ],
  ["https://example.com/", "http://localhost:3001/", undefined],
  [
    "http://books.localhost:3001/superminds",
    "http://localhost:3001/",
    undefined,
  ],
])("resolves %s from %s", (href, from, expected) => {
  vi.stubEnv("NODE_ENV", "development");
  expect(prototypeDestination(href, from)?.href).toBe(expected);
});
it("keeps production portal navigation in the current main app", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(
    prototypeDestination(
      "https://weightlifting.chappyasel.com/",
      "https://www.chappyasel.com/",
    )?.href,
  ).toBe("https://www.chappyasel.com/weightlifting");
});
it("normalizes the main domain alias on the return trip", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(
    prototypeDestination(
      "https://chappyasel.com/",
      "https://www.chappyasel.com/books",
    )?.href,
  ).toBe("https://www.chappyasel.com/");
});
it("leaves external sites and local URLs alone in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  for (const href of [
    "https://example.com/books",
    "http://books.localhost:3000/",
    "http://localhost:3000/",
  ]) {
    expect(
      prototypeDestination(href, "https://www.chappyasel.com/"),
    ).toBeNull();
  }
});
