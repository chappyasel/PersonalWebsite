import { describe, expect, it } from "vitest";

import { staticColliderSupportY } from "./physics";
import { SHELF_GEOMETRY } from "./shelfGeometry";

describe("static collider support height", () => {
  it("keeps shelf-world neighbours above their local plank surface", () => {
    expect(staticColliderSupportY("top")).toBe(0);
    expect(staticColliderSupportY("lower")).toBe(0);
  });

  it("keeps floor-world neighbours down on the shared room floor", () => {
    expect(staticColliderSupportY("floor")).toBe(SHELF_GEOMETRY.groundY);
    expect(staticColliderSupportY("floor")).toBeLessThan(0);
  });
});
