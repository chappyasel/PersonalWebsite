import { describe, expect, it } from "vitest";

import {
  interactionProfileForPointer,
  presentationProfileForViewport,
} from "./presentation";

describe("presentation and interaction profiles", () => {
  it("selects presentation only from geometry", () => {
    expect(presentationProfileForViewport(390, 844)).toBe("portrait");
    expect(presentationProfileForViewport(768, 1024)).toBe("portrait");
    expect(presentationProfileForViewport(844, 390)).toBe("short-landscape");
    expect(presentationProfileForViewport(1199, 900)).toBe("wide");
    expect(presentationProfileForViewport(1200, 1600)).toBe("wide");
  });

  it("classifies every actual pointer event independently", () => {
    expect(interactionProfileForPointer("touch")).toBe("coarse");
    expect(interactionProfileForPointer("mouse")).toBe("fine");
    expect(interactionProfileForPointer("pen")).toBe("fine");
  });
});
