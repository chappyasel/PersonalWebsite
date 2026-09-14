import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controls = readFileSync(
  new URL("./SheetControls.tsx", import.meta.url),
  "utf8",
);
const globals = readFileSync(
  new URL("../../styles/globals.css", import.meta.url),
  "utf8",
);
const inspector = readFileSync(
  new URL("../images/ImageViewerChrome.tsx", import.meta.url),
  "utf8",
);

function rule(selector: string) {
  const start = globals.indexOf(`${selector} {`);
  const end = globals.indexOf("\n}", start);
  return globals.slice(start, end + 2);
}

describe("sheet control presentation", () => {
  it("keeps both control icons bold", () => {
    expect(controls.match(/weight="bold"/g)).toHaveLength(2);
  });

  it("shares the homepage edge treatment with the artifact controls", () => {
    expect(globals).toContain(
      'html[data-world] [data-home-glass]::before',
    );
    expect(controls).toContain('data-home-glass="control"');
    expect(inspector).toContain('data-home-glass="control"');
    expect(rule('html.dark[data-world] [data-home-glass="control"]')).toContain(
      "box-shadow: var(--placard-media-shadow)",
    );
    expect(rule(".sheet-control")).not.toContain("inset");
  });
});
