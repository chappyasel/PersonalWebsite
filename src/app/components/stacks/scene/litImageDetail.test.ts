import { describe, expect, it } from "vitest";

import {
  clearReleasedLitImageDetail,
  liveLitImageDetailResource,
} from "./litImageDetail";

describe("LitImage detail lease cleanup", () => {
  it("does not offer a disposed detail during an off-to-on reload", () => {
    const disposed = { id: "disposed" };
    let released = false;
    const selected = {
      url: "detail.jpg",
      resource: disposed,
      isReleased: () => released,
    };

    expect(
      liveLitImageDetailResource({
        detail: selected,
        enabled: true,
        url: "detail.jpg",
      }),
    ).toBe(disposed);
    // Release is synchronous; React has not committed the queued clear yet.
    released = true;
    expect(
      liveLitImageDetailResource({
        detail: selected,
        enabled: true,
        url: "detail.jpg",
      }),
    ).toBeNull();
    expect(clearReleasedLitImageDetail(selected, selected)).toBeNull();
  });

  it("does not clear a newer lease record for the same cached resource", () => {
    const sharedResource = { id: "shared" };
    const released = {
      url: "detail.jpg",
      resource: sharedResource,
      isReleased: () => true,
    };
    const current = {
      url: "detail.jpg",
      resource: sharedResource,
      isReleased: () => false,
    };

    expect(clearReleasedLitImageDetail(current, released)).toBe(current);
  });
});
