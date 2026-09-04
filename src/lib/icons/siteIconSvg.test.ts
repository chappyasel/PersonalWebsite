import { describe, expect, it } from "vitest";

import { SECTION_ICONS, type GlyphIconSpec } from "./sectionIcons";
import { siteIconSvg, siteImageIconSvg } from "./siteIconSvg";

const glyph = (key: keyof typeof SECTION_ICONS): GlyphIconSpec => {
  const spec = SECTION_ICONS[key];
  if (spec.kind !== "glyph") throw new Error(`${key} is not a glyph icon`);
  return spec;
};

describe("siteIconSvg", () => {
  it("carries both schemes behind a prefers-color-scheme block", () => {
    const svg = siteIconSvg(glyph("routine"), "rt");
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain("@media (prefers-color-scheme: dark){");
    // Day sky and night sky both present, glyph colour for each: the sky's
    // ink by day, the morning ochre by night.
    expect(svg).toContain("#126bb0");
    expect(svg).toContain("#1c284d");
    expect(svg).toContain("#rt .g{fill:hsl(40, 30%, 96%)}");
    expect(svg).toContain("#rt .g{fill:hsl(38, 48%, 68%)}");
  });

  it("shows the sun by day and the moon, stars and city lights by night", () => {
    const svg = siteIconSvg(glyph("manual"), "mn");
    const [day, night] = svg.split("@media (prefers-color-scheme: dark)");
    expect(day).toContain("#mn .night{display:none}");
    expect(night).toContain("#mn .night{display:inline}#mn .day{display:none}");
    expect(svg).toContain('<g class="day">');
    expect(svg).toContain('<g class="night">');
    expect(svg).toContain('<g class="nl">');
  });

  it("draws the Golden Gate and the hills in each scheme's paint", () => {
    const svg = siteIconSvg(glyph("liarsdice"), "ld");
    expect(svg).toContain('class="f-ggb"');
    expect(svg).toContain('class="f-sil"');
    expect(svg).toContain("#ld .f-ggb{fill:hsl(8, 36%, 42%)}");
    expect(svg).toContain("#ld .f-ggb{fill:#a63a46}");
    expect(svg).toContain("#ld .f-sil{fill:#5b7288}");
    expect(svg).toContain("#ld .f-sil{fill:#191a2c}");
  });

  it("leaves out the skyline east of the window", () => {
    const svg = siteIconSvg(glyph("liarsdice"), "ld");
    // Sutro, downtown and the Bay Bridge sit past x 400 in strip units;
    // nothing placed there should be in the file.
    const xs = [...svg.matchAll(/<(?:rect|circle)[^>]* c?x="(-?[\d.]+)"/g)].map(
      (match) => Number(match[1]),
    );
    expect(xs.length).toBeGreaterThan(10);
    expect(Math.max(...xs)).toBeLessThan(400);
    // The two hill silhouettes span the window and stay (about 7KB of path
    // data); everything east of it goes. The unpruned file is 39KB.
    expect(svg.length).toBeLessThan(30000);
  });

  it("draws the glyph from Phosphor path data over the card", () => {
    const svg = siteIconSvg(glyph("liarsdice"), "ld");
    expect(svg).toMatch(/<g class="g" transform="translate\(12\.8 12\.8\) scale\([\d.]+\)"><path d="M[^"]+"\/>/);
  });

  it("scopes every id and selector so two can share a document", () => {
    const a = siteIconSvg(glyph("dad"), "a");
    const b = siteIconSvg(glyph("dad"), "b");
    expect(a).toContain('id="a-sky"');
    expect(b).toContain('id="b-sky"');
    expect(a).not.toContain("#b ");
  });
});

describe("siteImageIconSvg", () => {
  const spec = SECTION_ICONS.weightlifting;
  if (spec.kind !== "image") throw new Error("weightlifting is the app icon");

  it("embeds the light tile and the dark appearance over a dark tile", () => {
    const svg = siteImageIconSvg(spec, "wl", {
      light: "data:image/jpeg;base64,LIGHT",
      dark: "data:image/png;base64,DARK",
    });
    expect(svg).toContain('<image class="l" href="data:image/jpeg;base64,LIGHT"');
    expect(svg).toContain('<image href="data:image/png;base64,DARK"');
    expect(svg).toContain(`stop-color="${spec.darkTile.top}"`);
    const [day, night] = svg.split("@media (prefers-color-scheme: dark)");
    expect(day).toContain("#wl .d{display:none}");
    expect(night).toContain("#wl .l{display:none}#wl .d{display:inline}");
    expect(svg).toContain('clip-path="url(#wl-tile)"');
  });

  it("points at the app icon files shipped under public/", () => {
    expect(spec.light.svg).toBe("/images/weightlifting/app-icon-128.jpg");
    expect(spec.light.png).toBe("/images/weightlifting/app-icon-256.jpg");
    expect(spec.dark).toBe("/images/weightlifting/app-icon-dark-128.png");
  });
});
