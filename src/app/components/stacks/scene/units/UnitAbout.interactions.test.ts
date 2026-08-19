import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./UnitAbout.tsx", import.meta.url),
  "utf8",
);

describe("About shelf throwable props", () => {
  it("keeps the globe's spin egg on a grabbable carrier", () => {
    const start = source.indexOf('hoverKey="egg:globe"');
    const end = source.indexOf('id="portrait"', start);
    const globe = source.slice(Math.max(0, start - 300), end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(globe).toContain("<Grabbable");
    expect(globe).toContain("<SpinProp");
  });

  it("mounts the linked portrait through the throwable photo carrier", () => {
    const start = source.indexOf('id="portrait"');
    const end = source.indexOf('id="about-family-v8"', start);
    const portrait = source.slice(Math.max(0, start - 100), end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(portrait).toContain("<LoosePhoto");
    expect(portrait).not.toContain("<PhotoMount");
  });

  it("limits reading-book hover presentation to the authored shelf pose", () => {
    const start = source.indexOf("function ReadingBookHover");
    const end = source.indexOf("const READING_BOARD_THICKNESS", start);
    const hover = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(hover).toContain("readingBookAtAuthoredPose");
    expect(hover).toContain("authoredBase");
  });

  it("gives the AIC mark a padded pointer target that physics ignores", () => {
    const start = source.indexOf('hoverKey="grab:ai-collective-mark"');
    const end = source.indexOf("<ReadingStack", start);
    const collective = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(collective).toContain('name="interaction-hit:ai-collective"');
    expect(collective).toContain("physicsIgnore: true");
  });

  it("simplifies every About plant to its solid planter collision", () => {
    expect(source.match(/colliderProfile="foliage-base"/g)).toHaveLength(3);
  });
});
