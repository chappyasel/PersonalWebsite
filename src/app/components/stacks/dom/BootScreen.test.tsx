import { readingBookMaterialColors } from "../../../../lib/books/coverEdgeColor";
import { ABOUT_BOOT_COMPOSITION } from "../scene/aboutBootComposition";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";
import { PALETTES } from "../theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BootScreen, {
  BOOT_CADENCE_SETTLE_SECONDS,
  bootCadence,
  bootCssKeyframes,
  bootItemKeyframes,
  bootItemPose,
  bootWaveIntroKeyframes,
  bootWaveKeyframes,
  bootWaveWindow,
} from "./BootScreen";

const BOOKS = [{ id: "alpha" }, { id: "bravo" }, { id: "charlie" }] as const;

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
