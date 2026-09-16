import type * as NextOg from "next/og";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import satori from "satori";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ExerciseImage from "./[slug]/opengraph-image";
import { loadWeightliftingOgFonts } from "./ogFonts";
import HomeImage from "./opengraph-image";

const mocks = vi.hoisted(() => ({
  stats: vi.fn(),
  resolve: vi.fn(),
  detail: vi.fn(),
  element: null as ReactNode,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/og", async (importOriginal) => {
  const actual = await importOriginal<typeof NextOg>();
  return {
    ...actual,
    ImageResponse: class extends actual.ImageResponse {
      constructor(...args: ConstructorParameters<typeof actual.ImageResponse>) {
        super(...args);
        mocks.element = args[0];
      }
    },
  };
});
vi.mock("~/server/queries/weightlifting", () => ({
  getCachedWeightliftingStats: mocks.stats,
}));
vi.mock("~/server/queries/resolveExercise", () => ({
  resolveExercise: mocks.resolve,
}));
vi.mock("~/server/queries/weightliftingExercise", () => ({
  getCachedExerciseDetail: mocks.detail,
}));

beforeEach(() => {
  mocks.stats.mockResolvedValue({
    totalWorkouts: 2048,
    totalSets: 42120,
    totalVolume: 56200000,
    totalDurationSeconds: 3600 * 3080,
    earliestWorkout: "2017-06-01",
  });
  mocks.resolve.mockResolvedValue({
    entry: { name: "Bench Press", displayName: "Flat Barbell Bench Press" },
    allVariants: false,
  });
  mocks.detail.mockResolvedValue({
    displayName: "Flat Barbell Bench Press",
    category: "Chest",
    instanceCount: 250,
    totalSets: 1480,
    totalVolume: 1250000,
    firstPerformed: "2017-06-01",
    best: { oneRM: 280, reps: 5, weight: 245 },
  });
});

async function assertImage(response: Response) {
  const png = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(png).metadata();
  expect([metadata.width, metadata.height]).toEqual([1200, 630]);
  const fonts = await loadWeightliftingOgFonts();
  let iconBounds = { left: 0, top: 0, width: 0, height: 0 };
  await satori(mocks.element, {
    width: 1200,
    height: 630,
    fonts,
    onNodeDetected: (node) => {
      expect(node.left).toBeGreaterThanOrEqual(-1);
      expect(node.top).toBeGreaterThanOrEqual(-1);
      expect(node.left + node.width).toBeLessThanOrEqual(1201);
      expect(node.top + node.height).toBeLessThanOrEqual(631);
      if (node.type === "img") iconBounds = node;
    },
  });
  expect(iconBounds.width).toBeGreaterThan(0);
  const iconSize = Math.round(iconBounds.width);
  const inset = Math.round(iconSize / 6);
  const cropSize = iconSize - inset * 2;
  const icon = readFileSync("public/images/weightlifting/app-icon-256.jpg");
  const expectedCrop = await sharp(icon)
    .resize(iconSize, iconSize)
    .extract({ left: inset, top: inset, width: cropSize, height: cropSize })
    .toBuffer();
  const actualCrop = await sharp(png)
    .extract({
      left: Math.round(iconBounds.left) + inset,
      top: Math.round(iconBounds.top) + inset,
      width: cropSize,
      height: cropSize,
    })
    .toBuffer();
  const expected = await sharp(expectedCrop).stats();
  const actual = await sharp(actualCrop).stats();
  for (let channel = 0; channel < 3; channel++) {
    expect(
      Math.abs(
        actual.channels[channel]!.mean - expected.channels[channel]!.mean,
      ),
    ).toBeLessThan(8);
  }
  const { data } = await sharp(png)
    .extract({ left: 1190, top: 620, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([...data.subarray(0, 3)]).toEqual([250, 250, 250]);
}

describe("weightlifting share images", () => {
  it("renders a centered homepage title, icon, and the four dashboard stats", async () => {
    await assertImage(await HomeImage());
    const markup = renderToStaticMarkup(mocks.element);
    for (const text of [
      "Workouts",
      "Sets",
      "Volume",
      "Hours",
      "2,048",
      "42,120",
      "56.2M",
      "3,080",
    ])
      expect(markup).toContain(text);
    expect(markup).not.toContain("<svg");
    expect(markup).toContain("font-family:SF Pro Rounded");
    expect(markup).toContain("font-size:84px");
  });

  it("renders exercise 1RMe, volume, sets, and its category dot", async () => {
    await assertImage(
      await ExerciseImage({ params: Promise.resolve({ slug: "bench-press" }) }),
    );
    const markup = renderToStaticMarkup(mocks.element);
    for (const text of [
      "5 × 245",
      "280",
      "Total volume",
      "1.3M",
      "Total sets",
      "1,480",
      "Chest",
      "background-color:#039BE5",
    ])
      expect(markup).toContain(text);
    expect(markup).not.toContain("Recorded instances");
    expect(markup).not.toContain("Best 1RMe");
    expect(mocks.detail).toHaveBeenCalledWith(
      "Flat Barbell Bench Press",
      false,
    );
  });

  it("retains the app branding when training data is unavailable", async () => {
    mocks.stats.mockRejectedValueOnce(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await assertImage(await HomeImage());
    } finally {
      log.mockRestore();
    }
  });

  it("retains the app branding for an unknown exercise", async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    await assertImage(
      await ExerciseImage({ params: Promise.resolve({ slug: "unknown" }) }),
    );
  });
});
