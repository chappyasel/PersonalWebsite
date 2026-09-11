import { afterEach, expect, it, vi } from "vitest";

import { prototypeDestination } from "./navigation";

afterEach(() => vi.unstubAllEnvs());
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
it("does not normalize production cross-origin navigation", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(
    prototypeDestination(
      "https://weightlifting.chappyasel.com/",
      "https://www.chappyasel.com/",
    ),
  ).toBeNull();
});
