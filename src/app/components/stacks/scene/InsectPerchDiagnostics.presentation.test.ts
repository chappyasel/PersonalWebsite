import { describe, expect, it } from "vitest";

import {
  INSECT_PERCH_GLYPH_STYLE,
  insectPerchGlyphIsVisible,
} from "./InsectPerchDiagnostics";
import { InsectDiagnosticsController } from "./insectPerchDiagnostic";

describe("Perch diagnostic scene glyphs", () => {
  it("keeps scene markers hidden until the reviewer asks for them", () => {
    const controller = new InsectDiagnosticsController();
    const snapshot = controller.getSnapshot();

    expect(insectPerchGlyphIsVisible(snapshot, "books:test")).toBe(false);

    controller.update({ hoveredPerchId: "books:test" });
    expect(
      insectPerchGlyphIsVisible(controller.getSnapshot(), "books:test"),
    ).toBe(true);
    expect(
      insectPerchGlyphIsVisible(controller.getSnapshot(), "books:other"),
    ).toBe(false);

    controller.update({ hoveredPerchId: null, showRoutes: true });
    expect(
      insectPerchGlyphIsVisible(controller.getSnapshot(), "books:other"),
    ).toBe(true);
  });

  it("uses small debug primitives instead of an insect-like silhouette", () => {
    expect(INSECT_PERCH_GLYPH_STYLE.authored.shape).toBe("diamond");
    expect(INSECT_PERCH_GLYPH_STYLE.contact.shape).toBe("box");
    expect(INSECT_PERCH_GLYPH_STYLE.authored.size).toBeLessThan(0.02);
    expect(INSECT_PERCH_GLYPH_STYLE.contact.size).toBeLessThan(0.02);
    expect(INSECT_PERCH_GLYPH_STYLE.envelope.defaultVisible).toBe(false);
  });
});
