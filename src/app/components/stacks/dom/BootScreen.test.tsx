import { readingBookMaterialColors } from "../../../../lib/books/coverEdgeColor";
import {
  ABOUT_AIC_BASE_DEPTH,
  ABOUT_AIC_BASE_WIDTH,
  ABOUT_AIC_MARK_DEPTH,
  ABOUT_AIC_MARK_WIDTH,
} from "../scene/aboutAwardGeometry";
import {
  ABOUT_BOOT_COMPOSITION,
  ABOUT_BOOT_LANDMARKS,
  ABOUT_BOOT_PAINT_COMPOSITION,
  ABOUT_BOOT_VISIBLE_COMPOSITION,
  aboutProjectedBoxWidth,
} from "../scene/aboutBootComposition";
import { aboutBootFrameProjection } from "../scene/aboutBootFrameProjection";
import { ABOUT_BOOT_MODEL_SILHOUETTES } from "../scene/aboutBootSilhouettes";
import { ABOUT_ROLES } from "../scene/aboutRoleIcons";
import {
  ABOUT_AIC_MARK_YAW,
  ABOUT_AIC_ROOT_YAW,
  ABOUT_MODEL_POSES,
} from "../scene/aboutScenePose";
import {
  COORDINATION_NODE_COUNT,
  createCoordinationNetwork,
} from "../scene/coordinationNetwork";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";
import {
  ABOUT_READING_BOOK,
  ABOUT_READING_COVER_IMAGE,
  readingBookCoverPerspectiveElevation,
  readingBookForeEdgePerspectiveElevation,
  readingBookImagePerspectiveElevation,
  readingBookPageCorePerspectiveElevation,
  readingStackPoses,
} from "../scene/units/aboutReadingStack";
import { VISION_PRO_PROFILE } from "../scene/visionProGeometry";
import { CAMERA } from "../scene/worldLayout";
import { PALETTES } from "../theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BootScreen, { BootReadingBooksBridge } from "./BootScreen";
import {
  BOOT_CADENCE_SETTLE_SECONDS,
  BOOT_DUST_COUNTS,
  BOOT_DUST_SPAWN_DELAY_MS,
  BOOT_DUST_SPAWN_WINDOW_MS,
  BOOT_DUST_TRAVEL_MULTIPLIER,
  BOOT_FRAME_PHOTOS,
  BOOT_WAIT_NOTES,
  BOOT_WAIT_NOTE_FADE_MS,
  BOOT_WAIT_NOTE_INTERVAL_MS,
  BOOT_WAIT_NOTE_LINES,
  BOOT_WAIT_STAGES,
  bootCadence,
  bootCssKeyframes,
  bootItemKeyframes,
  bootItemPose,
  bootRevealComplete,
  createBootDustDrift,
  projectSceneY,
} from "./bootVignette";

const BOOKS = [
  { id: "alpha", coverSrc: "/covers/alpha.webp" },
  { id: "bravo", coverSrc: "/covers/bravo.webp" },
  { id: "charlie", coverSrc: "/covers/charlie.webp" },
] as const;
const FRAME_IDS = ["portrait", "family-frame", "profile-frame"] as const;

const COLORS = {
  alpha: { edge: "#a84f35", source: "edge" as const },
  bravo: { edge: "#3f7355", source: "edge" as const },
  charlie: { edge: "#315f8d", source: "edge" as const },
};

function renderBoot(bookCount = 0) {
  return renderToStaticMarkup(
    <BootScreen
      readingBooks={BOOKS.slice(0, bookCount)}
      readingBookColors={COLORS}
    />,
  );
}

function renderedPlanks(markup: string) {
  return [
    ...markup.matchAll(/data-boot-plank="" data-shelf-id="([^"]+)"/g),
  ].map((match) => match[1]);
}

function renderedLandmarks(markup: string) {
  return [
    ...markup.matchAll(
      /data-landmark-id="([^"]+)" data-shelf-id="([^"]+)" data-cadence-slot="([^"]+)"/g,
    ),
  ].map((match) => ({
    id: match[1],
    shelf: match[2],
    slot: Number(match[3]),
  }));
}

describe("Homepage entrance", () => {
  it("renders exactly the two shared full-width shelf planks", () => {
    const markup = renderBoot();

    expect(renderedPlanks(markup)).toEqual(
      SHELF_PLANKS.map((plank) => plank.id),
    );
    expect(renderedPlanks(markup)).toHaveLength(2);
    for (const plank of SHELF_PLANKS) {
      expect(plank.width).toBe(SHELF_GEOMETRY.width);
      expect(markup).toContain(`data-depth="${plank.depth}"`);
    }
  });

  it("renders every boot-visible landmark once on its declared shelf", () => {
    const landmarks = renderedLandmarks(renderBoot());

    expect(landmarks).toEqual(
      ABOUT_BOOT_PAINT_COMPOSITION.map(({ landmark, cadenceSlot }) => ({
        id: landmark.id,
        shelf: landmark.shelf,
        slot: cadenceSlot,
      })),
    );
    expect(new Set(landmarks.map(({ id }) => id)).size).toBe(landmarks.length);
    expect(
      [...renderBoot().matchAll(/data-model-silhouette="([^"]+)"/g)]
        .map((match) => match[1])
        .sort(),
    ).toEqual(
      [
        "globe",
        "succulent",
        "cactus",
        "large-plant",
        "desk-lamp",
        "dumbbell",
        "ai-collective",
        "tj-medallion",
      ].sort(),
    );
  });

  it("fills the three upright frames from small loading-screen sources", () => {
    const markup = renderBoot();
    const photos = [...markup.matchAll(/data-boot-photo="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(photos).toEqual(
      ABOUT_BOOT_PAINT_COMPOSITION.map(({ landmark }) => landmark)
        .filter((landmark) => "imageProfile" in landmark)
        .map(({ id }) => id),
    );
    expect(markup.match(/class="stacks-boot-frame-empty"/g)).toHaveLength(3);
    for (const photo of Object.values(BOOT_FRAME_PHOTOS)) {
      expect(markup).toContain(photo.src.replaceAll("&", "&amp;"));
    }
    expect(markup).not.toContain("opacity:0;transition:opacity 160ms ease-out");
    expect(BOOT_FRAME_PHOTOS.portrait.src).toContain("w=384");
    expect(markup).not.toContain('data-landmark-id="collective-frame"');
  });

  it("uses each live frame's real photo-to-border ratio", () => {
    const markup = renderBoot();

    for (const id of FRAME_IDS) {
      const landmark = ABOUT_BOOT_LANDMARKS[id];
      const image = landmark.imageProfile;
      const projection = aboutBootFrameProjection(id);
      const points = projection.image
        .map(([x, y]) => `${x * 100},${y * 100}`)
        .join(" ");
      const tag = new RegExp(
        `<polygon class="stacks-boot-frame-empty" data-boot-frame-image="${id}"[^>]*>`,
      ).exec(markup)?.[0];

      expect(tag).toBeDefined();
      expect(tag).toContain(`points="${points}"`);
      const matPoints = projection.mat
        .map(([x, y]) => `${x * 100},${y * 100}`)
        .join(" ");
      const matTag = new RegExp(
        `<polygon class="stacks-boot-frame-inner" data-boot-frame-inner="${id}"[^>]*>`,
      ).exec(markup)?.[0];
      expect(matTag).toContain(`points="${matPoints}"`);
      const photoTag = new RegExp(
        `<image class="stacks-boot-frame-photo"[^>]*data-boot-photo="${id}"[^>]*>`,
      ).exec(markup)?.[0];
      expect(photoTag).toContain(`width="${image.width}"`);
      expect(photoTag).toContain(`height="${image.height}"`);
      expect(photoTag).not.toContain("clip-path");
      expect((landmark.profile.width - image.width) / 2).toBeCloseTo(
        id === "portrait" ? 0.0624 : 0.024,
        8,
      );
    }
  });

  it("keeps the standing photos' inner trim separate from the outer frame", () => {
    const markup = renderBoot();

    for (const id of FRAME_IDS) {
      const outer = markup.indexOf(`data-boot-frame-outline="${id}"`);
      const inner = markup.indexOf(`data-boot-frame-inner="${id}"`);
      const photo = markup.indexOf(`data-boot-photo="${id}"`);

      expect(outer).toBeGreaterThan(-1);
      expect(inner).toBeGreaterThan(outer);
      expect(photo).toBeGreaterThan(inner);
    }
  });

  it("projects all three standing frames at their complete live rest poses", () => {
    const markup = renderBoot();

    for (const id of FRAME_IDS) {
      const outline = aboutBootFrameProjection(id).outer;
      const points = outline.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
      expect(markup).toContain(
        `data-boot-frame-outline="${id}" points="${points}"`,
      );
      expect(new Set(outline.map(([, y]) => y)).size).toBeGreaterThan(2);
    }
  });

  it("projects the reading fan from the live shelf poses with mild perspective", () => {
    const markup = renderBoot(3);
    const landmarkX = ABOUT_BOOT_LANDMARKS["reading-stack"].x;

    readingStackPoses().forEach((pose, index) => {
      const elevation = readingBookCoverPerspectiveElevation(
        pose,
        CAMERA.z,
        ABOUT_READING_BOOK.thickness,
      );
      const points = elevation
        .map(([x, y]) => `${(x - landmarkX) * 100},${-y * 100}`)
        .join(" ");
      expect(markup).toContain(
        `data-boot-reading-cover="${index}" points="${points}"`,
      );
      const leftHeight = Math.abs(elevation[3][1] - elevation[0][1]);
      const rightHeight = Math.abs(elevation[2][1] - elevation[1][1]);
      expect(Math.abs(leftHeight - rightHeight)).toBeGreaterThan(0);
      expect(Math.abs(leftHeight - rightHeight)).toBeLessThan(0.02);
      expect(elevation[2][1]).not.toBeCloseTo(elevation[3][1], 10);
    });
  });

  it("projects a cream page block inside each colored book edge", () => {
    const markup = renderBoot(3);
    const landmarkX = ABOUT_BOOT_LANDMARKS["reading-stack"].x;

    readingStackPoses().forEach((pose, index) => {
      const edge = readingBookForeEdgePerspectiveElevation(
        pose,
        CAMERA.z,
        ABOUT_READING_BOOK.thickness,
      )
        .map(([x, y]) => `${(x - landmarkX) * 100},${-y * 100}`)
        .join(" ");
      const pageCore = readingBookPageCorePerspectiveElevation(
        pose,
        CAMERA.z,
        ABOUT_READING_BOOK.thickness,
      )
        .map(([x, y]) => `${(x - landmarkX) * 100},${-y * 100}`)
        .join(" ");
      const group = new RegExp(
        `<g class="stacks-boot-reading-book"[^>]*data-reading-book="${BOOKS[index]!.id}"[\\s\\S]*?</g>`,
      ).exec(markup)?.[0];

      expect(group).toContain(`class="stacks-boot-book-edge" points="${edge}"`);
      expect(group).toContain(
        `data-boot-reading-page-core="${index}" points="${pageCore}"`,
      );
    });
  });

  it("projects each cover image at the live inset instead of filling its board", () => {
    const markup = renderBoot(3);
    const landmarkX = ABOUT_BOOT_LANDMARKS["reading-stack"].x;

    readingStackPoses().forEach((pose, index) => {
      const image = readingBookImagePerspectiveElevation(
        pose,
        CAMERA.z,
        ABOUT_READING_BOOK.thickness,
      );
      const board = readingBookCoverPerspectiveElevation(
        pose,
        CAMERA.z,
        ABOUT_READING_BOOK.thickness,
      );
      const centerX = (quad: typeof image) =>
        quad.reduce((sum, [x]) => sum + x, 0) / quad.length;
      const points = image
        .map(([x, y]) => `${(x - landmarkX) * 100},${-y * 100}`)
        .join(" ");
      const projectionTag = new RegExp(
        `<polygon data-boot-reading-image="${index}"[^>]*>`,
      ).exec(markup)?.[0];
      expect(projectionTag).toContain(`points="${points}"`);
      expect(Math.abs(centerX(image) - centerX(board))).toBeLessThan(0.001);
    });
  });

  it("lays each small cover face over its colored vector fallback", () => {
    const markup = renderBoot(3);
    const faces = [...markup.matchAll(/data-boot-book-face="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(faces).toEqual(BOOKS.map(({ id }) => id).reverse());
    expect(markup.match(/class="stacks-boot-book-cover"/g)).toHaveLength(3);
    expect(markup.match(/class="stacks-boot-book-page-core"/g)).toHaveLength(3);
    expect(markup).not.toContain("stacks-boot-book-page-line");
    for (const book of BOOKS) {
      expect(markup).toContain(`href="${book.coverSrc}"`);
    }
    for (const book of BOOKS) {
      const tag = new RegExp(
        `<image class="stacks-boot-book-cover-photo"[^>]*data-boot-book-face="${book.id}"[^>]*>`,
      ).exec(markup)?.[0];
      expect(tag).toBeDefined();
      expect(tag).not.toContain("opacity:");
      expect(tag).not.toContain("clip-path");
      expect(tag).toContain(`width="${ABOUT_READING_COVER_IMAGE.width}"`);
      expect(tag).toContain(`height="${ABOUT_READING_COVER_IMAGE.height}"`);
      expect(tag).toContain('preserveAspectRatio="xMidYMid slice"');
    }
    expect(markup.indexOf('data-boot-book-face="alpha"')).toBeGreaterThan(
      markup.indexOf('data-boot-book-face="bravo"'),
    );
    expect(markup.indexOf('data-boot-book-face="bravo"')).toBeGreaterThan(
      markup.indexOf('data-boot-book-face="charlie"'),
    );
  });

  it("includes the ground dumbbell from the exact live pose", () => {
    const markup = renderBoot();
    const pose = ABOUT_MODEL_POSES.dumbbell;

    expect(markup).toContain('data-boot-ground-prop="dumbbell"');
    expect(markup).toContain('data-model-silhouette="dumbbell"');
    expect(markup).toContain(
      `translate(${pose.base[0] * 100} ${projectSceneY(pose.base[1])})`,
    );
  });

  it("derives both shelf uprights and feet without exposed lower cleats", () => {
    const markup = renderBoot();
    const support = SHELF_GEOMETRY.support;
    const groundY = -SHELF_GEOMETRY.groundY * 100;
    const topY =
      -(SHELF_GEOMETRY.top.centerY - SHELF_GEOMETRY.top.thickness / 2) * 100;
    const supportX = SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX;
    const projectedX = (side: number, width: number, depth: number) => {
      const xs = [-width / 2, width / 2].flatMap((dx) =>
        [-depth / 2, depth / 2].map((dz) => {
          const z = SHELF_GEOMETRY.strapZ + dz;
          return (side * supportX + dx) * (CAMERA.z / (CAMERA.z - z)) * 100;
        }),
      );
      const left = Math.min(...xs);
      return { left, width: Math.max(...xs) - left };
    };
    const attribute = (tag: string | undefined, name: string) =>
      Number(new RegExp(`${name}="([^"]+)"`).exec(tag ?? "")?.[1]);

    for (const side of [-1, 1]) {
      const upright = new RegExp(
        `<rect data-boot-support-upright="${side}"[^>]*>`,
      ).exec(markup)?.[0];
      const foot = new RegExp(
        `<rect data-boot-support-foot="${side}"[^>]*>`,
      ).exec(markup)?.[0];
      const uprightX = projectedX(side, support.width, support.width);
      const footX = projectedX(side, support.footWidth, support.footDepth);

      expect(attribute(upright, "x")).toBeCloseTo(uprightX.left, 10);
      expect(attribute(upright, "y")).toBeCloseTo(topY, 10);
      expect(attribute(upright, "width")).toBeCloseTo(uprightX.width, 10);
      expect(attribute(upright, "height")).toBeCloseTo(groundY - topY, 10);
      expect(attribute(foot, "x")).toBeCloseTo(footX.left, 10);
      expect(attribute(foot, "width")).toBeCloseTo(footX.width, 10);
      expect(attribute(foot, "height")).toBeCloseTo(
        support.footHeight * 100,
        10,
      );
    }
    expect(markup).not.toContain("data-boot-support-cleat");
  });

  it("paints top-shelf plants behind the standing photos", () => {
    const markup = renderBoot();

    expect(markup.indexOf('data-landmark-id="cactus"')).toBeLessThan(
      markup.indexOf('data-landmark-id="family-frame"'),
    );
    expect(markup.indexOf('data-landmark-id="large-plant"')).toBeLessThan(
      markup.indexOf('data-landmark-id="profile-frame"'),
    );
  });

  it("streams preload requests for the exact covers before the bridge hydrates", () => {
    const markup = renderToStaticMarkup(
      <BootReadingBooksBridge
        readingBooks={[...BOOKS]}
        readingBookColors={COLORS}
      />,
    );

    for (const book of BOOKS) {
      expect(markup).toContain(`data-boot-reading-cover-preload="${book.id}"`);
      expect(markup).toContain(`href="${book.coverSrc}"`);
    }
  });

  it("first-paints three deterministic colored jackets before book data streams", () => {
    const markup = renderToStaticMarkup(<BootScreen />);
    const fallbackEdges = [
      ...markup.matchAll(/data-edge-color="(#[\da-f]{6})"/gi),
    ].map((match) => match[1]);

    expect(fallbackEdges).toHaveLength(3);
    expect(new Set(fallbackEdges).size).toBeGreaterThan(1);
    expect(markup).not.toContain("data-boot-book-face");
  });

  it("traces Vision Pro's real band, enclosure, and glass geometry", () => {
    const markup = renderBoot();

    expect(markup).toContain('data-boot-vision-pro=""');
    expect(markup).toContain('class="stacks-boot-vision-band"');
    expect(markup).toContain('class="stacks-boot-vision-silhouette"');
    expect(markup).toContain('class="stacks-boot-vision-enclosure"');
    expect(markup).toContain('class="stacks-boot-vision-glass"');
    expect(markup).toContain(
      `d="${ABOUT_BOOT_MODEL_SILHOUETTES["vision-pro"].parts.glass}"`,
    );
    expect(
      markup.indexOf('class="stacks-boot-vision-silhouette"'),
    ).toBeLessThan(markup.indexOf('class="stacks-boot-vision-band"'));
    expect(markup).not.toContain("data-boot-apple");
  });

  it("keeps the AIC mark's directional shine", () => {
    const markup = renderBoot();

    expect(markup).toContain('id="stacks-boot-aic-shine"');
  });

  it("uses the live TJ medallion artwork instead of an approximate boot mark", () => {
    const markup = renderBoot();

    expect(markup).toContain('data-boot-tj-artwork=""');
    expect(markup).toContain('href="/images/stacks/tj-medallion.jpg"');
    expect(markup).toContain("clip-path:ellipse(50% 50% at center) fill-box");
    expect(markup).not.toContain("stacks-boot-tj-artwork-pattern");
    expect(markup).not.toContain('class="stacks-boot-tj-detail"');
  });

  it("applies the live uniform scale to the AIC boot glyph", () => {
    const markup = renderBoot();
    const aicScale = Number(/data-boot-aic-scale="([^"]+)"/.exec(markup)?.[1]);

    expect(aicScale).toBeCloseTo(
      ABOUT_BOOT_LANDMARKS["ai-collective"].profile.height / 0.208,
    );
    expect(markup).toContain(`data-boot-aic-root-yaw="${ABOUT_AIC_ROOT_YAW}"`);
    expect(markup).toContain(`data-boot-aic-mark-yaw="${ABOUT_AIC_MARK_YAW}"`);
  });

  it("seats the AIC billet slightly into the loading-screen shelf", () => {
    const markup = renderBoot();
    const seat = Number(/data-boot-aic-seat="([^"]+)"/.exec(markup)?.[1]);

    expect(seat).toBeCloseTo(0.8);
  });

  it("matches the live dimensions of the four lower-shelf keepsakes", () => {
    expect(ABOUT_BOOT_LANDMARKS["ai-collective"].profile).toEqual({
      width:
        Math.max(
          aboutProjectedBoxWidth(
            ABOUT_AIC_BASE_WIDTH,
            ABOUT_AIC_BASE_DEPTH,
            ABOUT_AIC_ROOT_YAW,
          ),
          aboutProjectedBoxWidth(
            ABOUT_AIC_MARK_WIDTH,
            ABOUT_AIC_MARK_DEPTH,
            ABOUT_AIC_ROOT_YAW + ABOUT_AIC_MARK_YAW,
          ),
        ) *
        1.32 *
        1.1 *
        1.2,
      height: 0.208 * 1.32 * 1.1 * 1.2,
    });
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].profile).toEqual({
      width: ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].profile[1],
    });
    expect(ABOUT_BOOT_LANDMARKS["coordination-globe"].profile).toEqual({
      width: 0.21 * 1.386 * 1.1 * 1.2,
      height: 0.255 * 1.386 * 1.1 * 1.2,
    });
    expect(ABOUT_BOOT_LANDMARKS["vision-pro"].profile).toEqual(
      VISION_PRO_PROFILE,
    );
  });

  it("draws the four Role Icons with their live yaw and artwork", () => {
    const markup = renderBoot();
    const tiles = [...markup.matchAll(/data-boot-role="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(tiles).toEqual(ABOUT_ROLES.map((role) => role.id));
    for (const role of ABOUT_ROLES) {
      expect(markup).toContain(
        `--stacks-boot-role-light:${role.bootColor.light}`,
      );
      expect(markup).toContain(
        `--stacks-boot-role-dark:${role.bootColor.dark}`,
      );
      expect(markup).toContain(`data-boot-role-yaw="${role.yaw}"`);
      expect(markup).toContain(`data-boot-role-artwork="${role.id}"`);
      expect(markup).toContain(`href="${role.artwork}"`);
      const artwork = new RegExp(
        `<image class="stacks-boot-role-artwork"[^>]*data-boot-role-artwork="${role.id}"[^>]*>`,
      ).exec(markup)?.[0];
      expect(markup).toContain(`id="stacks-boot-role-clip-${role.id}"`);
      expect(artwork).toContain(
        `clip-path="url(#stacks-boot-role-clip-${role.id})"`,
      );
    }
    expect(ABOUT_BOOT_LANDMARKS["role-icons"].shelf).toBe("lower");
    expect(ABOUT_BOOT_LANDMARKS["role-icons"].x).toBeGreaterThan(
      ABOUT_BOOT_LANDMARKS["vision-pro"].x,
    );
  });

  it("keeps the cactus at its thirty-percent reduction on the top plank", () => {
    expect(ABOUT_BOOT_LANDMARKS.cactus.shelf).toBe("top");
    expect(ABOUT_BOOT_LANDMARKS.cactus.sceneScale).toBeCloseTo(0.34 * 0.7);
    expect(ABOUT_BOOT_LANDMARKS.cactus.profile).toEqual({
      width: ABOUT_BOOT_MODEL_SILHOUETTES.cactus.profile[0],
      height: ABOUT_BOOT_MODEL_SILHOUETTES.cactus.profile[1],
    });
  });

  it("sizes every GLB silhouette from its generated live-pose bounds", () => {
    for (const id of [
      "globe",
      "succulent",
      "cactus",
      "large-plant",
      "desk-lamp",
    ] as const) {
      expect(ABOUT_BOOT_LANDMARKS[id].profile).toEqual({
        width: ABOUT_BOOT_MODEL_SILHOUETTES[id].profile[0],
        height: ABOUT_BOOT_MODEL_SILHOUETTES[id].profile[1],
      });
    }
  });

  it("projects the complete live Coordination network into the boot orb", () => {
    const markup = renderBoot();
    const liveNetwork = createCoordinationNetwork();

    expect(markup).toMatch(
      /<circle class="stacks-boot-coordination-core"[^>]*>/,
    );
    expect(markup).not.toContain("stacks-boot-coordination-shell");
    expect(markup).not.toContain("stacks-boot-coordination-horizon-ring");
    expect(markup.match(/class="stacks-boot-coordination-node"/g)).toHaveLength(
      COORDINATION_NODE_COUNT,
    );
    expect(markup).toContain(
      `data-boot-coordination-edges="${liveNetwork.edges.length}"`,
    );
    expect(
      markup.match(/class="stacks-boot-coordination-reveal"/g),
    ).toHaveLength(liveNetwork.longConnections.length);
    expect(markup).toContain(
      `data-boot-coordination-reveals="${liveNetwork.longConnections.length}"`,
    );
    expect(markup).toContain('class="stacks-boot-coordination-network"');
    const ditherPixels = markup.match(
      /class="stacks-boot-coordination-dither"/g,
    );
    expect(ditherPixels?.length).toBeGreaterThan(100);
    expect(markup).toContain('data-dither-grid="ordered-4x4"');
  });

  it("serializes Coordination network geometry at a canonical precision", () => {
    const markup = renderBoot();
    const edgePath =
      /class="stacks-boot-coordination-link"[^>]*d="([^"]+)"/.exec(markup)?.[1];
    const nodeTags = [
      ...markup.matchAll(
        /<circle class="stacks-boot-coordination-node"[^>]*>/g,
      ),
    ].map(([tag]) => tag);
    const serializedNumbers = [
      ...(edgePath?.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []),
      ...nodeTags.flatMap((tag) => [
        ...tag.matchAll(/(?:cx|cy|r)="(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)"/gi),
      ]),
    ].map((match) => match[1] ?? match[0]);

    expect(serializedNumbers.length).toBeGreaterThan(COORDINATION_NODE_COUNT);
    for (const value of serializedNumbers) {
      expect(value).toMatch(/^-?\d+(?:\.\d{1,6})?$/);
    }
  });

  it("uses the live material families for every untextured boot object", () => {
    const markup = renderBoot();
    const coloredLandmarks = [
      "globe",
      "succulent",
      "large-plant",
      "cactus",
      "desk-lamp",
      "ai-collective",
      "coordination-globe",
      "tj-medallion",
      "vision-pro",
    ] as const;

    for (const id of coloredLandmarks) {
      const { colorProfile } = ABOUT_BOOT_LANDMARKS[id];
      expect(colorProfile.light).toMatch(/^#[\da-f]{6}$/i);
      expect(colorProfile.dark).toMatch(/^#[\da-f]{6}$/i);
      expect(markup).toContain(
        `--stacks-boot-object-light:${colorProfile.light}`,
      );
      expect(markup).toContain(
        `--stacks-boot-object-dark:${colorProfile.dark}`,
      );
    }
  });

  it("contains no legacy placeholder rows, books, or fake progress copy", () => {
    const markup = renderBoot();

    expect(markup).toContain("Chappy Asel");
    expect(markup).not.toContain("data-book=");
    expect(markup).not.toContain("stacks-boot-bookcase");
    expect(markup).not.toContain("stacks-boot-shelf");
    expect(markup).not.toContain("stacks-boot-ground");
    expect(markup).not.toMatch(/progress/i);
  });

  it("renders one restrained immediate wait message with authored room copy", () => {
    const markup = renderBoot();

    // The gates, in the order they are passed.
    expect(BOOT_WAIT_STAGES).toEqual([
      "starting",
      "assets",
      "firstFrame",
      "meadow",
      "opening",
    ]);
    // Every gate has enough truthful lines to avoid ping-ponging between a
    // pair while it waits.
    expect(BOOT_WAIT_NOTES).toEqual({
      starting: [
        "Waiting for first light.",
        "Waking up the room.",
        "Turning the first key.",
        "Finding the light switch.",
        "Lifting the dust cover.",
        "Getting the room on its feet.",
      ],
      assets: [
        "Setting out the books.",
        "Unfolding the map.",
        "Hanging the photographs.",
        "Putting the plants in place.",
        "Setting up the desk.",
        "Placing the artifacts.",
      ],
      firstFrame: [
        "Warming the room.",
        "Lighting the little lamp.",
        "Turning on the lighthouse.",
        "Drawing the first frame.",
        "Finding the right shadows.",
        "Bringing the walls into view.",
      ],
      meadow: [
        "Growing the meadow.",
        "Letting the moths wander.",
        "Planting the last few blades.",
        "Stirring the tall grass.",
        "Scattering the wildflowers.",
        "Giving the grass some wind.",
      ],
      opening: [
        "Giving the globe a turn.",
        "Opening the room.",
        "Straightening the shelves.",
        "Taking one last look.",
        "Clearing the doorway.",
        "Handing you the key.",
      ],
    });
    expect(BOOT_WAIT_NOTE_LINES).toHaveLength(30);
    expect(new Set(BOOT_WAIT_NOTE_LINES.map((l) => l.text)).size).toBe(30);
    for (const stage of BOOT_WAIT_STAGES)
      expect(BOOT_WAIT_NOTES[stage]).toHaveLength(6);
    expect(BOOT_WAIT_NOTE_FADE_MS).toBe(420);
    expect(BOOT_WAIT_NOTE_INTERVAL_MS).toBe(1_200);
    // The rotation is per-gate state, not a CSS carousel: nothing in the strip
    // advances through the gates on a timer.
    expect(markup).not.toContain("--stacks-boot-wait-cycle");
    expect(markup).not.toContain("--stacks-boot-wait-delay");
    expect(markup.match(/data-boot-wait=""/g)).toHaveLength(1);
    expect(markup).toContain("Loading the 3D room");
    expect(markup.match(/class="stacks-boot-wait-dot"/g)).toHaveLength(3);
    for (const line of BOOT_WAIT_NOTE_LINES)
      expect(markup).toContain(line.text);
    // The server render is the first gate's first line, because on the server
    // nothing has loaded. Exactly one note is ever active.
    expect(markup.match(/data-boot-note="active"/g)).toHaveLength(1);
    expect(markup).toContain(
      `data-boot-note="active">${BOOT_WAIT_NOTES.starting[0]!}`,
    );
    expect(BOOT_DUST_COUNTS).toEqual({
      light: { initial: 8, maximum: 12 },
      dark: { initial: 3, maximum: 7 },
    });
    expect(BOOT_DUST_SPAWN_DELAY_MS).toEqual({
      minimum: 2_000,
      maximum: 4_000,
    });
    expect(BOOT_DUST_SPAWN_WINDOW_MS).toBe(30_000);
    expect(BOOT_DUST_TRAVEL_MULTIPLIER).toBe(2);
    expect(markup.match(/data-boot-mote="dust"/g)).toHaveLength(12);
    expect(markup).toContain("--stacks-boot-dust-light:#b76a0b");
    expect(markup).toContain("--stacks-boot-dust-halo-light:#f2b63f");
    expect(markup).not.toContain("data-boot-lamp-light");
    expect(markup).not.toContain("stacks-boot-butterfly");
    expect(markup.indexOf("stacks-boot-motes")).toBeLessThan(
      markup.indexOf("stacks-boot-wordmark"),
    );
  });

  it("authors a slow, seamless dust drift with intermittent light catches", () => {
    const drift = createBootDustDrift({ x: 20, y: -12 }, 1.7, 0.9, true);
    const opacities = drift.keyframes.map(({ opacity }) => Number(opacity));

    expect(drift.keyframes).toHaveLength(33);
    expect(drift.durationMs).toBeGreaterThan(20_000);
    expect(drift.durationMs).toBeLessThan(25_000);
    expect(drift.keyframes[0]?.transform).toBe(
      drift.keyframes.at(-1)?.transform,
    );
    expect(drift.keyframes[0]?.opacity).toBe(drift.keyframes.at(-1)?.opacity);
    expect(Math.min(...opacities)).toBeLessThan(0.2);
    expect(Math.max(...opacities)).toBeGreaterThan(0.9);
  });

  it.each([0, 1, 2, 3])(
    "renders exactly %i server-selected reading books and sampled colors",
    (bookCount) => {
      const markup = renderBoot(bookCount);
      const rendered = [...markup.matchAll(/data-reading-book="([^"]+)"/g)];

      expect(rendered.map((match) => match[1])).toEqual(
        BOOKS.slice(0, bookCount)
          .map((book) => book.id)
          .reverse(),
      );
      for (const book of BOOKS.slice(0, bookCount)) {
        const sampled = COLORS[book.id];
        const light = readingBookMaterialColors(
          sampled.edge,
          PALETTES.light.pages,
          false,
        );
        const dark = readingBookMaterialColors(
          sampled.edge,
          PALETTES.dark.pages,
          true,
        );
        expect(markup).toContain(`data-edge-color="${sampled.edge}"`);
        expect(markup).toContain(`data-book-color-light="${light.cover}"`);
        expect(markup).toContain(`data-book-color-dark="${dark.cover}"`);
      }
    },
  );

  it("assigns unique deterministic cadence slots for the one-shot reveal", () => {
    const first = renderBoot(3);
    const second = renderBoot(3);
    const landmarks = renderedLandmarks(first);
    const cadence = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);

    expect(first).toBe(second);
    expect(landmarks.map(({ slot }) => slot)).toEqual(
      ABOUT_BOOT_PAINT_COMPOSITION.map(({ cadenceSlot }) => cadenceSlot),
    );
    expect(new Set(landmarks.map(({ slot }) => slot)).size).toBe(
      landmarks.length,
    );
    expect(first).toContain(
      `--stacks-boot-reveal-duration:${cadence.revealDuration.toFixed(2)}s`,
    );
    cadence.delays.forEach((_, index) => {
      expect(first).toContain(`@keyframes stacks-boot-reveal-${index}`);
      expect(first).not.toContain(`@keyframes stacks-boot-wave-intro-${index}`);
      expect(first).not.toContain(`@keyframes stacks-boot-wave-${index}`);
      expect(first).toContain(`animation-name:stacks-boot-reveal-${index}`);
    });
  });

  it("continuously fades and settles each item from one shared progress", () => {
    const cadence = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);
    const index = 4;
    const start = cadence.delays[index]! / cadence.revealDuration;
    const end = start + BOOT_CADENCE_SETTLE_SECONDS / cadence.revealDuration;

    expect(bootItemPose(start, index, cadence)).toEqual({
      opacity: 0,
      offsetY: 7,
    });
    const middle = bootItemPose((start + end) / 2, index, cadence);
    expect(middle.opacity).toBeCloseTo(0.5, 5);
    expect(middle.offsetY).toBeCloseTo(3.5, 5);
    expect(bootItemPose(end, index, cadence)).toEqual({
      opacity: 1,
      offsetY: 0,
    });
  });

  it("builds a compositor-only loop with a constant base rate", () => {
    const cadence = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);
    const keyframes = bootItemKeyframes(4, cadence);

    expect(keyframes).toHaveLength(4);
    expect(keyframes.map(({ offset }) => offset)).toEqual(
      [...keyframes.map(({ offset }) => offset)].sort(
        (left, right) => Number(left) - Number(right),
      ),
    );
    for (const keyframe of keyframes) {
      expect(Object.keys(keyframe).sort()).toEqual(
        expect.arrayContaining(["offset", "opacity", "transform"]),
      );
      expect(keyframe).not.toHaveProperty("left");
      expect(keyframe).not.toHaveProperty("top");
    }
    expect(
      bootCssKeyframes(ABOUT_BOOT_VISIBLE_COMPOSITION.length, cadence),
    ).not.toContain("left:");
  });

  it("reveals once and never resets the completed shelf to empty", () => {
    const cadence = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);
    const frames = bootItemKeyframes(
      ABOUT_BOOT_VISIBLE_COMPOSITION.length - 1,
      cadence,
    );

    expect(cadence.delays[0]).toBe(0);
    expect(frames.at(-1)).toMatchObject({ opacity: 1, offset: 1 });
    expect(frames.slice(2).every(({ opacity }) => opacity === 1)).toBe(true);
  });

  it("accepts the CSS animation's terminal time as a completed reveal", () => {
    const cadence = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);
    const cssDurationMs = Number(cadence.revealDuration.toFixed(2)) * 1000;

    // Fourteen boot-visible landmarks since the Role Icons joined the shelf:
    // thirteen 0.12 s steps plus the 0.32 s settle.
    expect(ABOUT_BOOT_VISIBLE_COMPOSITION).toHaveLength(14);
    expect(cssDurationMs).toBe(1880);
    expect(cadence.revealDuration * 1000).toBeGreaterThanOrEqual(cssDurationMs);
    expect(bootRevealComplete(0, cssDurationMs, cadence.revealDuration)).toBe(
      true,
    );
  });

  it("leaves every landmark fully visible after its one-shot reveal", () => {
    const css = bootCssKeyframes(
      ABOUT_BOOT_VISIBLE_COMPOSITION.length,
      bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length),
    );
    expect(css).not.toContain("stacks-boot-wave");
    expect(css).not.toContain("opacity:0.18");
    const top = ABOUT_BOOT_COMPOSITION.filter(({ shelf }) => shelf === "top");
    const lower = ABOUT_BOOT_COMPOSITION.filter(
      ({ shelf }) => shelf === "lower",
    );
    expect(top.map(({ x }) => x)).toEqual(
      [...top.map(({ x }) => x)].sort((a, b) => a - b),
    );
    expect(lower.map(({ x }) => x)).toEqual(
      [...lower.map(({ x }) => x)].sort((a, b) => a - b),
    );
  });

  it("keeps every landmark origin supported and limits silhouette overhang", () => {
    const shelfLeft = -SHELF_GEOMETRY.width / 2;
    const shelfRight = SHELF_GEOMETRY.width / 2;
    const maximumOverhang = 0.03;

    for (const landmark of ABOUT_BOOT_COMPOSITION) {
      expect(landmark.x).toBeGreaterThanOrEqual(shelfLeft);
      expect(landmark.x).toBeLessThanOrEqual(shelfRight);
      expect(
        shelfLeft - (landmark.x - landmark.profile.width / 2),
      ).toBeLessThan(maximumOverhang);
      expect(landmark.x + landmark.profile.width / 2 - shelfRight).toBeLessThan(
        maximumOverhang,
      );
    }
  });

  it("is deterministic, decorative SSR markup with both scene palettes", () => {
    const markup = renderBoot(3);

    expect(markup).toContain('class="stacks-boot"');
    expect(markup).toContain('role="presentation"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).toContain(`--stacks-boot-wood-light:${PALETTES.light.wood}`);
    expect(markup).toContain(`--stacks-boot-wood-dark:${PALETTES.dark.wood}`);
  });
});
