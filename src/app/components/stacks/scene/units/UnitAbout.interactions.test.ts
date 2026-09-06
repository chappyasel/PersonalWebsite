import { ABOUT_BOOT_LANDMARKS } from "../aboutBootComposition";
import { ABOUT_ROLES, ABOUT_ROLE_ICON_SIZE } from "../aboutRoleIcons";
import { ABOUT_PHOTO_POSES, ABOUT_TOP_LANDMARK_Z } from "../aboutScenePose";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PROJECT_ARTIFACT_DIMENSIONS,
  REVIEWED_SHELF_LAYOUT,
} from "./unitShelfLayout";

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

  it("restages the shelf for a social header in screenshot mode", () => {
    expect(source).toContain(
      'import { useScreenshotMode } from "../screenshotMode"',
    );
    // The still-screen Macintosh takes the portrait's place, without the approach
    // (the flight is a room-wide singleton) and under its own hover key.
    const mac = source.indexOf("<StillMac");
    const portrait = source.indexOf('id="portrait"');
    expect(mac).toBeGreaterThanOrEqual(0);
    expect(mac).toBeLessThan(portrait);
    expect(source.slice(mac, portrait)).toContain('hoverKey="grab:mac:about"');
    expect(source.slice(mac, portrait)).toContain(
      "base={[ABOUT_BOOT_LANDMARKS.portrait.x, 0, SCREENSHOT_MAC_Z]}",
    );
    // The first three "Featured?" ticks replace the current reads.
    expect(source).toContain(
      "screenshot.enabled\n                    ? data.featuredBooks.slice(0, 3)\n                    : data.readingBooks",
    );
    expect(source).toContain(
      "screenshot.enabled\n                    ? data.featuredBookColors\n                    : data.readingBookColors",
    );
    // The couch and its shadow go together.
    const couchGate = source.indexOf("{!screenshot.enabled && (");
    const couch = source.indexOf("<SitChair");
    const couchPool = source.indexOf("size={[2.1, 1.6]}");
    expect(couchGate).toBeGreaterThanOrEqual(0);
    expect(couchGate).toBeLessThan(couch);
    expect(couch).toBeLessThan(couchPool);
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
    expect(photo).toContain('ABOUT_TOP_LANDMARK_Z["collective-frame"]');
    expect(ABOUT_TOP_LANDMARK_Z["collective-frame"]).toBe(0.255);
    expect(photo).toContain('name={aboutLandmarkNodeName("collective-frame")}');
  });

  it("lifts and opens only the three face-up photos", () => {
    const start = source.indexOf("function LoosePhoto");
    const end = source.indexOf("function ReadingStack", start);
    const loosePhoto = source.slice(start, end);
    const topShelf = source.slice(source.indexOf('hoverKey="egg:globe"'));

    expect(loosePhoto).toContain(
      "hingeOnHover ? ABOUT_TOP_PHOTO_HOVER_ANGLE : undefined",
    );
    expect(loosePhoto).toContain(
      "hingeOnHover ? ABOUT_TOP_PHOTO_HOVER_LIFT : undefined",
    );
    expect(source).toContain("const ABOUT_TOP_PHOTO_HOVER_ANGLE = Math.PI / 3");
    expect(source).toContain("const ABOUT_TOP_PHOTO_HOVER_LIFT = 0.025");
    expect(topShelf.match(/hingeOnHover/g)).toHaveLength(3);
    expect(topShelf.match(/<FlatPrint/g)).toHaveLength(3);
  });

  it("keeps the three standing frames in their authored poses", () => {
    expect(source).toContain("seat={deskFrameHeight(0.264) / 2}");
    // Family frame: the 2026-08-22 layout-editor placement, the editor's
    // carrier rotation composed onto the earlier authored tilt.
    expect(source).toContain(
      "rotation={[...ABOUT_PHOTO_POSES.family.rotation]}",
    );
    expect(ABOUT_PHOTO_POSES.family.rotation).toEqual([-0.172, -0.251, -0.102]);
    expect(source).toContain("seat={REVIEWED_SHELF_LAYOUT.about.profileSeat}");
    expect(source).toContain(
      "rotation={[...ABOUT_PHOTO_POSES.profile.rotation]}",
    );
    expect(ABOUT_PHOTO_POSES.profile.rotation).toEqual([
      -Math.PI / 6,
      -0.08,
      0,
    ]);
    expect(source).not.toContain('shelfPose="flat"');
  });

  it("aligns the smaller standing frames with the large portrait", () => {
    expect(source).toContain("ABOUT_PHOTO_POSES.family.baseZ");
    expect(source).toContain("ABOUT_PHOTO_POSES.profile.baseZ");
    expect(ABOUT_PHOTO_POSES.family.baseZ).toBe(0);
    expect(ABOUT_PHOTO_POSES.profile.baseZ).toBe(-0.045);
  });

  it("swaps the Arch and Collective frame positions", () => {
    expect(ABOUT_BOOT_LANDMARKS["collective-frame"].x).toBe(0.785);
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

  it("keeps the authored desk metals on their shimmer treatment", () => {
    const tjStart = authoredPropsSource.indexOf("function TJMedallionBody");
    const tjEnd = authoredPropsSource.indexOf(
      "export function ShakerProp",
      tjStart,
    );
    const tj = authoredPropsSource.slice(tjStart, tjEnd);

    expect(source).not.toContain('hoverKey="shimmer:apple"');
    expect(tjStart).toBeGreaterThanOrEqual(0);
    expect(tj).toContain("useMetalShimmer");
  });

  it("uses the authored sizes for the lower-shelf keepsakes", () => {
    expect(source).toContain("scale={ABOUT_AIC_SCALE}");
    expect(source).toContain("scale={ABOUT_COORDINATION_GLOBE_SCALE}");
    expect(source).toContain("<VisionProProp dark={dark} />");
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale).toBeCloseTo(
      0.726 * 1.0569,
    );
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

  it("stacks the four Role Icons beside Vision Pro as half-size Portals", () => {
    const start = source.indexOf('name={aboutLandmarkNodeName("role-icons")}');
    const end = source.indexOf('hoverKey="grab:ai-collective-mark"', start);
    const stack = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(stack).toContain("ABOUT_ROLES.map");
    expect(stack).toContain("<ProjectIcon");
    expect(stack).toContain("hoverKey={`link:about:role:${role.id}`}");
    expect(stack).toContain("href={role.href}");
    expect(stack).toContain("portalLabel={role.portalLabel}");
    expect(stack).toContain("size={ABOUT_ROLE_ICON_SIZE}");
    expect(stack).toContain('ABOUT_BOOT_LANDMARKS["role-icons"].x + dx');
    // Four roles, each a distinct organization with its own artwork and Portal.
    expect(new Set(ABOUT_ROLES.map((role) => role.id)).size).toBe(4);
    expect(new Set(ABOUT_ROLES.map((role) => role.href)).size).toBe(4);
    expect(new Set(ABOUT_ROLES.map((role) => role.artwork)).size).toBe(4);
    expect(ABOUT_ROLE_ICON_SIZE).toBe(PROJECT_ARTIFACT_DIMENSIONS.icon / 2);
  });

  it("keeps the cactus on top and swaps its position with the succulent", () => {
    const lowerStart = source.indexOf("lower={");
    const lowerEnd = source.indexOf("        }\n      >", lowerStart);
    const lower = source.slice(lowerStart, lowerEnd);
    const cactus = source.indexOf('hoverKey="grab:plant:about-cactus"');

    expect(cactus).toBeGreaterThan(lowerEnd);
    expect(lower).not.toContain("about-cactus");
    expect(ABOUT_BOOT_LANDMARKS.cactus.shelf).toBe("top");
    // 0.686 / -0.122: the owner's 2026-08-22 layout-editor placement.
    expect(ABOUT_BOOT_LANDMARKS.cactus.x).toBe(0.686);
    expect(ABOUT_BOOT_LANDMARKS.succulent.x).toBe(-0.81);
    expect(source).toContain("ABOUT_TOP_LANDMARK_Z.cactus");
    expect(source).toContain("ABOUT_TOP_LANDMARK_Z.succulent");
    expect(ABOUT_TOP_LANDMARK_Z.cactus).toBe(-0.122);
    expect(ABOUT_TOP_LANDMARK_Z.succulent).toBe(-0.1);
  });

  it("keeps the three face-up prints at their layout-editor depths", () => {
    // Owner placement, 2026-08-22: each print pulled toward the plank's
    // front edge by a different amount; the x's live in the landmark table
    // and REVIEWED_SHELF_LAYOUT.about.
    expect(source).toContain('ABOUT_TOP_LANDMARK_Z["collective-frame"]');
    expect(ABOUT_TOP_LANDMARK_Z["collective-frame"]).toBe(0.255);
    expect(source).toContain(
      "base={[REVIEWED_SHELF_LAYOUT.about.speakingPrintX, 0, 0.239]}",
    );
    expect(source).toContain(
      "base={[REVIEWED_SHELF_LAYOUT.about.archPrintX, 0, 0.231]}",
    );
    expect(REVIEWED_SHELF_LAYOUT.about.speakingPrintX).toBe(0.274);
  });
});
