import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(
  new URL("../../../../styles/globals.css", import.meta.url),
  "utf8",
);
const component = fs.readFileSync(
  new URL("./BootScreen.tsx", import.meta.url),
  "utf8",
);

function rule(selector: string) {
  const found = css.indexOf(`\n${selector}`);
  expect(found, `${selector} should exist`).toBeGreaterThanOrEqual(0);
  const start = found + 1;
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("boot presentation", () => {
  it("paints the bookcase immediately instead of fading the whole entry in", () => {
    expect(rule(".stacks-boot-entry {")).not.toContain("animation:");
  });

  it("keeps animation velocity independent from discrete WebGL progress", () => {
    expect(component).not.toContain("subscribeLoadProgress");
    expect(component).not.toContain("updatePlaybackRate");
  });

  it("matches the compact top-left wordmark tracking", () => {
    const wordmark = rule(".stacks-boot-wordmark {");
    expect(wordmark).toContain("margin: 0 0 28px");
    expect(wordmark).toContain("color: hsl(var(--foreground) / 0.95)");
    expect(wordmark).toContain("font-size: clamp(28.56px, 3.162vw, 44.88px)");
    expect(wordmark).toContain("letter-spacing: -0.025em");
  });

  it("uses no radial background treatment in dark mode", () => {
    const darkRule = rule(".dark .stacks-boot {");
    expect(darkRule).toContain("background: linear-gradient(");
    expect(darkRule).not.toContain("radial-gradient(");
    expect(rule(".dark .stacks-boot-entry::before {")).toContain(
      "display: none",
    );
  });
});
