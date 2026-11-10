import { describe, expect, it } from "vitest";

import { isBearerAuthorized } from "./bearer";

describe("isBearerAuthorized", () => {
  it("accepts only the configured bearer token", () => {
    expect(isBearerAuthorized("Bearer invented-token", "invented-token")).toBe(
      true,
    );
    expect(isBearerAuthorized("bearer invented-token", "invented-token")).toBe(
      true,
    );
    expect(isBearerAuthorized("Bearer invented-tokem", "invented-token")).toBe(
      false,
    );
    expect(isBearerAuthorized("Bearer invented", "invented-token")).toBe(false);
    expect(isBearerAuthorized("invented-token", "invented-token")).toBe(false);
    expect(isBearerAuthorized("Bearer ", "invented-token")).toBe(false);
    expect(isBearerAuthorized(null, "invented-token")).toBe(false);
  });

  it("refuses everything when no token is configured", () => {
    expect(isBearerAuthorized("Bearer ", undefined)).toBe(false);
    expect(isBearerAuthorized("Bearer anything", undefined)).toBe(false);
    expect(isBearerAuthorized("Bearer ", "")).toBe(false);
  });
});
