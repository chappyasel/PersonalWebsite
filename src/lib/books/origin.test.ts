import { describe, expect, it } from "vitest";

import { getBooksOrigin } from "./origin";

describe("getBooksOrigin", () => {
  it("points at the books dev host outside production", () => {
    expect(getBooksOrigin()).toMatch(/^http:\/\/books\.localhost:\d+$/);
  });
});
