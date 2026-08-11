import { describe, expect, it } from "vitest";

import { grabbablePhysicsEnabled } from "./grabbablePhysics";

describe("Grabbable physics preference", () => {
  it("keeps shelf physics on by default", () => {
    expect(grabbablePhysicsEnabled()).toBe(true);
    expect(grabbablePhysicsEnabled(true)).toBe(true);
  });

  it("allows authored contact compositions to opt out", () => {
    expect(grabbablePhysicsEnabled(false)).toBe(false);
  });
});
