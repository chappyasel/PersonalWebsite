import { readingBookMaterialColors } from "../../../../lib/books/coverEdgeColor";
import {
  ABOUT_BOOT_COMPOSITION,
  ABOUT_BOOT_LANDMARKS,
} from "../scene/aboutBootComposition";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";
import {
  readingBookPerspectiveElevation,
  readingStackPoses,
} from "../scene/units/aboutReadingStack";
import { CAMERA } from "../scene/worldLayout";
import { PALETTES } from "../theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BootScreen, {
  BOOT_CADENCE_SETTLE_SECONDS,
  BOOT_FRAME_PHOTOS,
  bootCadence,
  bootCssKeyframes,
  bootItemKeyframes,
  bootItemPose,
  bootWaveIntroKeyframes,
  bootWaveKeyframes,
  bootWaveWindow,
} from "./BootScreen";

const BOOKS = [
  { id: "alpha", coverSrc: "/covers/alpha.webp" },
  { id: "bravo", coverSrc: "/covers/bravo.webp" },
  { id: "charlie", coverSrc: "/covers/charlie.webp" },
] as const;

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

  it("renders every real landmark exactly once on its declared shelf", () => {
    const landmarks = renderedLandmarks(renderBoot());

    expect(landmarks).toEqual(
      ABOUT_BOOT_COMPOSITION.map((landmark, slot) => ({
        id: landmark.id,
        shelf: landmark.shelf,
        slot,
      })),
    );
    expect(new Set(landmarks.map(({ id }) => id)).size).toBe(landmarks.length);
    expect(
      [...renderBoot().matchAll(/data-model-silhouette="([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "globe",
      "succulent",
      "large-plant",
      "cactus",
      "desk-lamp",
      "ai-collective",
      "tj-medallion",
    ]);
  });

  it("fills the four real frames while retaining their immediate vector fallback", () => {
    const markup = renderBoot();
    const photos = [...markup.matchAll(/data-boot-photo="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(photos).toEqual(Object.keys(BOOT_FRAME_PHOTOS));
    expect(markup.match(/class="stacks-boot-frame-empty"/g)).toHaveLength(4);
    for (const photo of Object.values(BOOT_FRAME_PHOTOS)) {
      expect(markup).toContain(photo.src.replaceAll("&", "&amp;"));
    }
  });

  it("uses each live frame's real photo-to-border ratio", () => {
    const markup = renderBoot();

    for (const id of Object.keys(
      BOOT_FRAME_PHOTOS,
    ) as (keyof typeof BOOT_FRAME_PHOTOS)[]) {
      const landmark = ABOUT_BOOT_LANDMARKS[id];
      const image = landmark.imageProfile;
      const tag = new RegExp(`<image[^>]*data-boot-photo="${id}"[^>]*>`).exec(
        markup,
      )?.[0];

      expect(tag).toBeDefined();
      expect(tag).toContain(`width="${image.width * 100}"`);
      expect(tag).toContain(`height="${image.height * 100}"`);
      expect((landmark.profile.width - image.width) / 2).toBeCloseTo(
        id === "portrait" ? 0.0624 : 0.024,
        8,
      );
    }
  });

  it("projects the reading fan from the live shelf poses with mild perspective", () => {
    const markup = renderBoot(3);
    const landmarkX = ABOUT_BOOT_LANDMARKS["reading-stack"].x;

    readingStackPoses().forEach((pose, index) => {
      const elevation = readingBookPerspectiveElevation(pose, CAMERA.z);
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
    });
  });

  it("lays each real cover face over its colored decode fallback", () => {
    const markup = renderBoot(3);
    const faces = [...markup.matchAll(/data-boot-book-face="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(faces).toEqual(BOOKS.map(({ id }) => id));
    expect(markup.match(/class="stacks-boot-book-cover"/g)).toHaveLength(3);
    for (const book of BOOKS) {
      expect(markup).toContain(`href="${book.coverSrc}"`);
    }
    expect(markup.match(/preserveAspectRatio="none"/g)).toHaveLength(3);
    expect(markup.match(/transform="matrix\([^)]*\)"/g)).toHaveLength(3);
    expect(
      markup.match(/clip-path="url\(#stacks-boot-reading-cover-/g),
    ).toHaveLength(3);
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

  it("keeps the Apple mark's traced aspect ratio", () => {
    const markup = renderBoot();
    const apple = /<path[^>]*data-boot-apple=""[^>]*>/.exec(markup)?.[0];

    expect(apple).toBeDefined();
    expect(apple).not.toContain("transform=");
    expect(apple).toContain("C ");
  });

  it("matches the live dimensions of the three metal keepsakes", () => {
    expect(ABOUT_BOOT_LANDMARKS["ai-collective"].profile).toEqual({
      width: 0.205,
      height: 0.208,
    });
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].profile).toEqual({
      width: 0.216,
      height: 0.25344,
    });
    expect(ABOUT_BOOT_LANDMARKS.apple.profile).toEqual({
      width: 0.152,
      height: 0.176,
    });
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
      "tj-medallion",
      "apple",
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

  it("contains no legacy placeholder rows, books, labels, or progress copy", () => {
    const markup = renderBoot();

    expect(markup).toContain("Chappy Asel");
    expect(markup).not.toContain("data-book=");
    expect(markup).not.toContain("stacks-boot-bookcase");
    expect(markup).not.toContain("stacks-boot-shelf");
    expect(markup).not.toMatch(/progress|loading|status/i);
  });

  it.each([0, 1, 2, 3])(
    "renders exactly %i server-selected reading books and sampled colors",
    (bookCount) => {
      const markup = renderBoot(bookCount);
      const rendered = [...markup.matchAll(/data-reading-book="([^"]+)"/g)];

      expect(rendered.map((match) => match[1])).toEqual(
        BOOKS.slice(0, bookCount).map((book) => book.id),
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

  it("assigns unique deterministic cadence slots and derives the loop", () => {
    const first = renderBoot(3);
    const second = renderBoot(3);
    const landmarks = renderedLandmarks(first);
    const cadence = bootCadence(ABOUT_BOOT_COMPOSITION.length);

    expect(first).toBe(second);
    expect(landmarks.map(({ slot }) => slot)).toEqual(
      ABOUT_BOOT_COMPOSITION.map((_, index) => index),
    );
    expect(new Set(landmarks.map(({ slot }) => slot)).size).toBe(
      landmarks.length,
    );
    expect(first).toContain(
      `--stacks-boot-reveal-duration:${cadence.revealDuration.toFixed(2)}s`,
    );
    cadence.delays.forEach((_, index) => {
      expect(first).toContain(`@keyframes stacks-boot-reveal-${index}`);
      expect(first).toContain(`@keyframes stacks-boot-wave-intro-${index}`);
      expect(first).toContain(`@keyframes stacks-boot-wave-${index}`);
      expect(first).toContain(
        `animation-name:stacks-boot-reveal-${index}, stacks-boot-wave-intro-${index}, stacks-boot-wave-${index}`,
      );
    });
  });

  it("continuously fades and settles each item from one shared progress", () => {
    const cadence = bootCadence(ABOUT_BOOT_COMPOSITION.length);
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
    const cadence = bootCadence(ABOUT_BOOT_COMPOSITION.length);
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
      bootCssKeyframes(ABOUT_BOOT_COMPOSITION.length, cadence),
    ).not.toContain("left:");
  });

  it("reveals once and never resets the completed shelf to empty", () => {
    const cadence = bootCadence(ABOUT_BOOT_COMPOSITION.length);
    const frames = bootItemKeyframes(
      ABOUT_BOOT_COMPOSITION.length - 1,
      cadence,
    );

    expect(cadence.delays[0]).toBe(0);
    expect(frames.at(-1)).toMatchObject({ opacity: 1, offset: 1 });
    expect(frames.slice(2).every(({ opacity }) => opacity === 1)).toBe(true);
  });

  it("moves one contiguous quarter-width window through the declared order", () => {
    const count = ABOUT_BOOT_COMPOSITION.length;
    const waves = Array.from({ length: count }, (_, index) =>
      bootWaveKeyframes(index, count),
    );

    expect(bootWaveWindow(0, count)).toEqual([0, 1, 2]);
    expect(bootWaveWindow(1, count)).toEqual([1, 2, 3]);
    expect(bootWaveWindow(5, count)).toEqual([5, 6, 7]);
    expect(bootWaveWindow(12, count)).toEqual([12, 0, 1]);
    for (let step = 0; step <= count; step += 1) {
      const dimmed = waves.flatMap((frames, index) =>
        Number(frames[step]?.opacity) === 0.18 ? [index] : [],
      );
      expect(dimmed).toEqual(
        [...bootWaveWindow(step, count)].sort((a, b) => a - b),
      );
    }

    expect(bootWaveIntroKeyframes(0, count)).toEqual([
      { opacity: 1, offset: 0 },
      { opacity: 0.18, offset: 1 },
    ]);
    expect(bootWaveIntroKeyframes(3, count).at(-1)).toMatchObject({
      opacity: 1,
    });

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

  it("keeps every declared silhouette supported by its full-width shelf", () => {
    const shelfLeft = -SHELF_GEOMETRY.width / 2;
    const shelfRight = SHELF_GEOMETRY.width / 2;

    for (const landmark of ABOUT_BOOT_COMPOSITION) {
      expect(landmark.x - landmark.profile.width / 2).toBeGreaterThanOrEqual(
        shelfLeft,
      );
      expect(landmark.x + landmark.profile.width / 2).toBeLessThanOrEqual(
        shelfRight,
      );
    }
  });

  it("is deterministic, decorative SSR markup with both scene palettes", () => {
    const markup = renderBoot(3);

    expect(markup).toContain('class="stacks-boot" aria-hidden="true"');
    expect(markup).toContain('role="presentation"');
    expect(markup).not.toContain("aria-live");
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).toContain(`--stacks-boot-wood-light:${PALETTES.light.wood}`);
    expect(markup).toContain(`--stacks-boot-wood-dark:${PALETTES.dark.wood}`);
  });
});
