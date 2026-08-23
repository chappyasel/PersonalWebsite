import { afterEach, describe, expect, it, vi } from "vitest";

import { orEmpty } from "./degrade";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orEmpty", () => {
  it("returns the loaded value when the loader succeeds", async () => {
    await expect(
      orEmpty("test", () => Promise.resolve(["a", "b"]), []),
    ).resolves.toEqual(["a", "b"]);
  });

  it("returns the neutral value when the loader rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      orEmpty("test", () => Promise.reject(new Error("connection refused")), []),
    ).resolves.toEqual([]);
  });

  it("catches a loader that throws synchronously", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      orEmpty("test", () => {
        throw new Error("boom");
      }, null),
    ).resolves.toBeNull();
  });

  // A degraded page that leaves no trace is an outage nobody finds. The label
  // is what makes one of three concurrent homepage loaders identifiable in a
  // log line.
  it("logs the failure with its label", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failure = new Error("connection refused");
    await orEmpty("home:books", () => Promise.reject(failure), []);
    expect(logged).toHaveBeenCalledWith(
      "[home:books] failed, rendering without it:",
      failure,
    );
  });
});
