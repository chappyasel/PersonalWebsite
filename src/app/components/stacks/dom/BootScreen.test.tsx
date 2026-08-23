import { readingBookMaterialColors } from "../../../../lib/books/coverEdgeColor";
import {
  ABOUT_AIC_BASE_WIDTH,
  ABOUT_APPLE_BASE_WIDTH,
} from "../scene/aboutAwardGeometry";
import {
  ABOUT_BOOT_COMPOSITION,
  ABOUT_BOOT_LANDMARKS,
  ABOUT_BOOT_VISIBLE_COMPOSITION,
} from "../scene/aboutBootComposition";
import { ABOUT_ROLES } from "../scene/aboutRoleIcons";
import {
  COORDINATION_NODE_COUNT,
  createCoordinationNetwork,
} from "../scene/coordinationNetwork";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";
import {
  readingBookPerspectiveElevation,
  readingStackPoses,
} from "../scene/units/aboutReadingStack";
import { CAMERA } from "../scene/worldLayout";
import { PALETTES } from "../theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BootScreen from "./BootScreen";
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
  bootWaveIntroKeyframes,
  bootWaveKeyframes,
  bootWaveWindow,
  createBootDustDrift,
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
      ABOUT_BOOT_VISIBLE_COMPOSITION.map((landmark, slot) => ({
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
      "cactus",
      "large-plant",
      "desk-lamp",
      "ai-collective",
      "tj-medallion",
    ]);
  });

  it("fills the three upright frames from small loading-screen sources", () => {
    const markup = renderBoot();
    const photos = [...markup.matchAll(/data-boot-photo="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(photos).toEqual(
      ABOUT_BOOT_VISIBLE_COMPOSITION.filter(
        (landmark) => "imageProfile" in landmark,
      ).map(({ id }) => id),
    );
    expect(markup.match(/class="stacks-boot-frame-empty"/g)).toHaveLength(3);
    for (const photo of Object.values(BOOT_FRAME_PHOTOS)) {
      expect(markup).toContain(photo.src.replaceAll("&", "&amp;"));
    }
    expect(BOOT_FRAME_PHOTOS.portrait.src).toContain("w=384");
    expect(markup).not.toContain('data-landmark-id="collective-frame"');
  });

  it("uses each live frame's real photo-to-border ratio", () => {
    const markup = renderBoot();

    for (const id of FRAME_IDS) {
      const landmark = ABOUT_BOOT_LANDMARKS[id];
      const image = landmark.imageProfile;
      const tag = new RegExp(
        `data-landmark-id="${id}"[\\s\\S]*?<rect class="stacks-boot-frame-empty"[^>]*>`,
      ).exec(markup)?.[0];

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

  it("lays each small cover face over its colored vector fallback", () => {
    const markup = renderBoot(3);
    const faces = [...markup.matchAll(/data-boot-book-face="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(faces).toEqual(BOOKS.map(({ id }) => id));
    expect(markup.match(/class="stacks-boot-book-cover"/g)).toHaveLength(3);
    for (const book of BOOKS) {
      expect(markup).toContain(`href="${book.coverSrc}"`);
    }
    expect(
      markup.match(/opacity:0;transition:opacity 160ms ease-out/g),
    ).toHaveLength(6);
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

  it("applies the live uniform scales to the AIC and Apple boot glyphs", () => {
    const markup = renderBoot();
    const aicScale = Number(/data-boot-aic-scale="([^"]+)"/.exec(markup)?.[1]);
    const appleScale = Number(
      /data-boot-apple-scale="([^"]+)"/.exec(markup)?.[1],
    );

    expect(aicScale).toBeCloseTo(
      ABOUT_BOOT_LANDMARKS["ai-collective"].profile.height / 0.208,
    );
    expect(appleScale).toBeCloseTo(
      ABOUT_BOOT_LANDMARKS.apple.profile.height / 0.176,
    );
  });

  it("seats the AIC billet slightly into the loading-screen shelf", () => {
    const markup = renderBoot();
    const seat = Number(/data-boot-aic-seat="([^"]+)"/.exec(markup)?.[1]);

    expect(seat).toBeCloseTo(0.8);
  });

  it("matches the live dimensions of the four lower-shelf keepsakes", () => {
    expect(ABOUT_BOOT_LANDMARKS["ai-collective"].profile).toEqual({
      width: ABOUT_AIC_BASE_WIDTH * 1.32 * 1.1 * 1.2,
      height: 0.208 * 1.32 * 1.1 * 1.2,
    });
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].profile).toEqual({
      width: 0.3 * 0.66 * 1.1,
      height: 0.352 * 0.66 * 1.1,
    });
    expect(ABOUT_BOOT_LANDMARKS["coordination-globe"].profile).toEqual({
      width: 0.21 * 1.386 * 1.1 * 1.2,
      height: 0.255 * 1.386 * 1.1 * 1.2,
    });
    expect(ABOUT_BOOT_LANDMARKS.apple.profile).toEqual({
      width: ABOUT_APPLE_BASE_WIDTH * 1.32 * 1.1,
      height: 0.176 * 1.32 * 1.1,
    });
  });

  it("draws the four Role Icons as brand-colored tiles beside the Apple", () => {
    const markup = renderBoot();
    const tiles = [...markup.matchAll(/data-boot-role="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(tiles).toEqual(ABOUT_ROLES.map((role) => role.id));
    for (const role of ABOUT_ROLES) {
      expect(markup).toContain(
        `--stacks-boot-role-light:${role.bootColor.light}`,
      );
      expect(markup).toContain(`--stacks-boot-role-dark:${role.bootColor.dark}`);
    }
    expect(ABOUT_BOOT_LANDMARKS["role-icons"].shelf).toBe("lower");
    expect(ABOUT_BOOT_LANDMARKS["role-icons"].x).toBeGreaterThan(
      ABOUT_BOOT_LANDMARKS.apple.x,
    );
  });

  it("keeps the cactus at its thirty-percent reduction on the top plank", () => {
    expect(ABOUT_BOOT_LANDMARKS.cactus.shelf).toBe("top");
    expect(ABOUT_BOOT_LANDMARKS.cactus.sceneScale).toBeCloseTo(0.34 * 0.7);
    expect(ABOUT_BOOT_LANDMARKS.cactus.profile).toEqual({
      width: 0.4 * 0.7,
      height: 0.35 * 0.7,
    });
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

  it("contains no legacy placeholder rows, books, or progress copy", () => {
    const markup = renderBoot();

    expect(markup).toContain("Chappy Asel");
    expect(markup).not.toContain("data-book=");
    expect(markup).not.toContain("stacks-boot-bookcase");
    expect(markup).not.toContain("stacks-boot-shelf");
    expect(markup).not.toContain("stacks-boot-ground");
    expect(markup).not.toMatch(/progress|status/i);
  });

  it("renders one restrained delayed wait message with authored room copy", () => {
    const markup = renderBoot();

    // The gates, in the order they are passed.
    expect(BOOT_WAIT_STAGES).toEqual([
      "starting",
      "assets",
      "firstFrame",
      "meadow",
      "opening",
    ]);
    // All ten authored lines survive; each sits under the gate it is true of,
    // and the lines within a gate take turns.
    expect(BOOT_WAIT_NOTES).toEqual({
      starting: ["Waiting for first light."],
      assets: ["Setting out the books.", "Unfolding the map."],
      firstFrame: [
        "Warming the room.",
        "Lighting the little lamp.",
        "Turning on the lighthouse.",
      ],
      meadow: ["Growing the meadow.", "Letting the moths wander."],
      opening: ["Giving the globe a turn.", "Opening the room."],
    });
    expect(BOOT_WAIT_NOTE_LINES).toHaveLength(10);
    expect(new Set(BOOT_WAIT_NOTE_LINES.map((l) => l.text)).size).toBe(10);
    expect(BOOT_WAIT_NOTE_FADE_MS).toBe(420);
    expect(BOOT_WAIT_NOTE_INTERVAL_MS).toBe(2_400);
    // The rotation is per-gate state, not a CSS carousel: nothing in the strip
    // advances through the gates on a timer.
    expect(markup).not.toContain("--stacks-boot-wait-cycle");
    expect(markup).not.toContain("--stacks-boot-wait-delay");
    expect(markup.match(/data-boot-wait=""/g)).toHaveLength(1);
    expect(markup).toContain("Loading");
    expect(markup.match(/class="stacks-boot-wait-dot"/g)).toHaveLength(3);
    for (const line of BOOT_WAIT_NOTE_LINES) expect(markup).toContain(line.text);
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
    const cadence = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);

    expect(first).toBe(second);
    expect(landmarks.map(({ slot }) => slot)).toEqual(
      ABOUT_BOOT_VISIBLE_COMPOSITION.map((_, index) => index),
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

  it("moves one contiguous quarter-width window through the declared order", () => {
    const count = ABOUT_BOOT_VISIBLE_COMPOSITION.length;
    const waves = Array.from({ length: count }, (_, index) =>
      bootWaveKeyframes(index, count),
    );

    // A quarter of fourteen landmarks rounds up to a four-wide window.
    expect(bootWaveWindow(0, count)).toEqual([0, 1, 2, 3]);
    expect(bootWaveWindow(1, count)).toEqual([1, 2, 3, 4]);
    expect(bootWaveWindow(5, count)).toEqual([5, 6, 7, 8]);
    expect(bootWaveWindow(12, count)).toEqual([12, 13, 0, 1]);
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
    // Index 4 is the first landmark outside the four-wide opening window.
    expect(bootWaveIntroKeyframes(3, count).at(-1)).toMatchObject({
      opacity: 0.18,
    });
    expect(bootWaveIntroKeyframes(4, count).at(-1)).toMatchObject({
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
