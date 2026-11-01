import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/globals.css", "utf8");

describe.each(["dark", "light"])("the %s accent video", (theme) => {
  const video = readFileSync(`public/hdr/accent-${theme}.mp4`);

  it("is small enough to loop on a first load", () => {
    expect(video.length).toBeLessThan(5 * 1024);
  });

  it("is tagged hvc1, which Safari needs to play HEVC", () => {
    expect(video.includes("hvc1")).toBe(true);
  });
});

describe("the HDR rules", () => {
  it("shows a playing video by inheriting, never with visible", () => {
    const shown = /\.hdr\[data-playing\]\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(shown).toContain("visibility: inherit");
    expect(css).toMatch(
      /@media \(dynamic-range: high\)\s*\{[^@]*\.hdr\[data-playing\]/,
    );
  });

  it("gives the 2D plate's video the block's own keyframes", () => {
    const block = /\.stacks-boot-coordination-blinker-block\s*\{([^}]*)\}/.exec(
      css,
    )?.[1];
    const plate = /\.coordination-hdr-glyph > \.hdr\s*\{([^}]*)\}/.exec(
      css,
    )?.[1];
    const blink = /animation: (.*);/;
    expect(blink.exec(plate!)?.[1]).toBe(blink.exec(block!)?.[1]);
  });
});
