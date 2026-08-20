import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  HOME_OG_BOTTOM_FADE,
  HOME_OG_SIGNATURE_TEXT,
} from "./homeOgPresentation";

const imageRoute = readFileSync(
  fileURLToPath(new URL("./opengraph-image.tsx", import.meta.url)),
  "utf8",
);

describe("home OG signature treatment", () => {
  it("uses a larger plain-white signature at ninety-percent opacity", () => {
    expect(HOME_OG_BOTTOM_FADE.background).toContain("0.58");
    expect(HOME_OG_SIGNATURE_TEXT.color).toBe("#ffffff");
    expect(HOME_OG_SIGNATURE_TEXT.opacity).toBe(0.9);
    expect(HOME_OG_SIGNATURE_TEXT.fontSize).toBe(63);
    expect(HOME_OG_SIGNATURE_TEXT).not.toHaveProperty("backgroundClip");
    expect(HOME_OG_SIGNATURE_TEXT).not.toHaveProperty("backgroundImage");
  });

  it("applies the presentation to the generated image route", () => {
    expect(imageRoute).toContain("style={HOME_OG_BOTTOM_FADE}");
    expect(imageRoute).toContain("style={HOME_OG_SIGNATURE_TEXT}");
    expect(imageRoute).not.toContain("HOME_OG_SIGNATURE_GLASS");
  });
});
