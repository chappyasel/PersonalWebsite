import { ABOUT_BOOT_LANDMARKS } from "../aboutBootComposition";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { REVIEWED_SHELF_LAYOUT } from "./unitShelfLayout";

const source = fs.readFileSync(
  new URL("./UnitAbout.tsx", import.meta.url),
  "utf8",
);
const authoredPropsSource = fs.readFileSync(
  new URL("../AuthoredProps.tsx", import.meta.url),
  "utf8",
);
const sitChairSource = fs.readFileSync(
  new URL("../SitChair.tsx", import.meta.url),
  "utf8",
);

describe("About shelf throwable props", () => {
  it("seats from the first couch touch instead of running Focus Lean", () => {
    expect(source).not.toContain(
      'import TouchFocusTarget from "../TouchFocusTarget"',
    );
    expect(source).toContain('import SitChair from "../SitChair"');
    expect(source).not.toContain('id="focus:couch:about"');
    expect(source).toContain("<SitChair");
    expect(sitChairSource).not.toContain("touchable={false}");
    expect(sitChairSource).toContain("activateOnFirstTouch");
    expect(sitChairSource.match(/e\.pointerType === "touch"/g)).toHaveLength(2);
  });

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
    expect(portrait).toContain("proxied(PORTRAIT_SRC, coverWidth)");
    expect(portrait).toContain("proxied(PORTRAIT_SRC, 1080)");
  });

  it("renders the relocated Collective photo as a face-up print", () => {
    const globe = source.indexOf('hoverKey="egg:globe"');
    const collective = source.indexOf('id="about-collective-group-v8"');
    const portrait = source.indexOf('id="portrait"', collective);
    const photo = source.slice(collective, portrait);

    expect(globe).toBeGreaterThanOrEqual(0);
    expect(collective).toBeGreaterThan(globe);
    expect(portrait).toBeGreaterThan(collective);
    expect(photo).toContain("<LoosePhoto");
    expect(photo).toContain("<FlatPrint");
    expect(photo).not.toContain("<DeskFrame");
    expect(photo).toContain(
      'base={[ABOUT_BOOT_LANDMARKS["collective-frame"].x, 0, 0.15]}',
    );
    expect(photo).toContain('name={aboutLandmarkNodeName("collective-frame")}');
  });

  it("opens only the three face-up photos by 60 degrees", () => {
    const start = source.indexOf("function LoosePhoto");
    const end = source.indexOf("function ReadingStack", start);
    const loosePhoto = source.slice(start, end);
    const topShelf = source.slice(source.indexOf('hoverKey="egg:globe"'));

    expect(loosePhoto).toContain(
      "hingeOnHover ? ABOUT_TOP_PHOTO_HOVER_ANGLE : undefined",
    );
    expect(source).toContain("const ABOUT_TOP_PHOTO_HOVER_ANGLE = Math.PI / 3");
    expect(topShelf.match(/hingeOnHover/g)).toHaveLength(3);
    expect(topShelf.match(/<FlatPrint/g)).toHaveLength(3);
  });

  it("keeps the three standing frames in their authored poses", () => {
    expect(source).toContain("seat={deskFrameHeight(0.264) / 2}");
    expect(source).toContain("rotation={[-0.08, 0.2, -0.025]}");
    expect(source).toContain("seat={REVIEWED_SHELF_LAYOUT.about.profileSeat}");
    expect(source).toContain("rotation={[-Math.PI / 6, -0.08, 0]}");
    expect(source).not.toContain('shelfPose="flat"');
  });

  it("aligns the smaller standing frames with the large portrait", () => {
    expect(source).toContain(
      'base={[ABOUT_BOOT_LANDMARKS["family-frame"].x, 0, 0]}',
    );
    expect(source).toContain(
      'base={[ABOUT_BOOT_LANDMARKS["profile-frame"].x, 0, 0]}',
    );
  });

  it("swaps the Arch and Collective frame positions", () => {
    expect(ABOUT_BOOT_LANDMARKS["collective-frame"].x).toBe(0.5);
    expect(REVIEWED_SHELF_LAYOUT.about.archPrintX).toBe(-0.81);
  });

  it("limits reading-book hover presentation to the authored shelf pose", () => {
    const start = source.indexOf("function ReadingBookHover");
    const end = source.indexOf("const READING_BOARD_THICKNESS", start);
    const hover = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(hover).toContain("readingBookAtAuthoredPose");
    expect(hover).toContain("authoredBase");
  });

  it("keeps a stationary pointer target under each animated reading book", () => {
    const start = source.indexOf("function ReadingBookHover");
    const end = source.indexOf("const READING_BOARD_THICKNESS", start);
    const hover = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(hover).toContain('name="interaction-hit:reading-book"');
    expect(hover).toContain("physicsIgnore: true");
  });

  it("gives all three desk metals the same shimmer and camera-facing tilt", () => {
    const appleStart = source.indexOf('hoverKey="shimmer:apple"');
    const appleEnd = source.indexOf("<ReadingStack", appleStart);
    const deskMetals = source.slice(appleStart, appleEnd);
    const tjStart = authoredPropsSource.indexOf("function TJMedallionBody");
    const tjEnd = authoredPropsSource.indexOf(
      "export function ShakerProp",
      tjStart,
    );
    const tj = authoredPropsSource.slice(tjStart, tjEnd);

    expect(appleStart).toBeGreaterThanOrEqual(0);
    expect(deskMetals).not.toContain("tiltOnHover={false}");
    expect(tjStart).toBeGreaterThanOrEqual(0);
    expect(tj).toContain("useMetalShimmer");
  });

  it("uses the authored sizes for the four lower-shelf awards", () => {
    expect(source.match(/scale=\{ABOUT_LOWER_AWARD_SCALE\}/g)).toHaveLength(1);
    expect(source).toContain("scale={ABOUT_AIC_SCALE}");
    expect(source).toContain("scale={ABOUT_COORDINATION_GLOBE_SCALE}");
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale).toBeCloseTo(0.726);
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
