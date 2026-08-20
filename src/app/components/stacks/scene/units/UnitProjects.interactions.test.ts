import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./UnitProjects.tsx", import.meta.url),
  "utf8",
);

describe("Projects shelf movable props", () => {
  it("requests inspection-quality project frames before they become visible", () => {
    expect(source).toContain("proxied(project.image, coverWidth)");
    expect(source).toContain("proxied(project.image, 750)");
  });

  it("mounts the compact Mac through a weighted draggable carrier", () => {
    const start = source.indexOf('hoverKey="link:projects:mac"');
    const carrier = source.slice(Math.max(0, start - 250), start + 250);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("<Grabbable");
    expect(carrier).toContain("massKg={7.5}");
  });
});
