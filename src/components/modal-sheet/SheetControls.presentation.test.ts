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
  new URL(
    "../../app/components/stacks/modal/SceneArtifactInspector.tsx",
    import.meta.url,
  ),
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
      ".world-glass-control,\nhtml[data-world] .sheet-control",
    );
    expect(inspector).toContain("world-glass-control border");
    expect(globals).toContain("inset 0 1px 0 var(--world-control-edge-top)");
    expect(globals).not.toContain(".world-glass-control::before");
    expect(rule(".sheet-control")).not.toContain("inset");
  });
});
