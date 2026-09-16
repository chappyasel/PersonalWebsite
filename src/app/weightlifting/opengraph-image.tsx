import { ImageResponse } from "next/og";

import { getCachedWeightliftingStats } from "~/server/queries/weightlifting";

import {
  WeightliftingOgFrame,
  WeightliftingOgStats,
  formatOgVolume,
  loadWeightliftingOgIcon,
} from "./ogCard";
import { loadWeightliftingOgFonts } from "./ogFonts";

export const runtime = "nodejs";
export const alt =
  "Chappy's Weightlifting: workouts, sets, volume, and training hours";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [icon, fonts] = await Promise.all([
    loadWeightliftingOgIcon(),
    loadWeightliftingOgFonts(),
  ]);
  let stats: Awaited<ReturnType<typeof getCachedWeightliftingStats>> | null =
    null;
  try {
    stats = await getCachedWeightliftingStats();
  } catch (error) {
    console.error("Error loading weightlifting OG stats:", error);
  }
  return new ImageResponse(
    (
      <WeightliftingOgFrame icon={icon} centered>
        {stats && (
          <WeightliftingOgStats
            centered
            stats={[
              {
                label: "Workouts",
                value: stats.totalWorkouts.toLocaleString("en-US"),
              },
              { label: "Sets", value: stats.totalSets.toLocaleString("en-US") },
              {
                label: "Volume",
                value: formatOgVolume(stats.totalVolume),
                unit: "lbs",
              },
              {
                label: "Hours",
                value: Math.round(
                  stats.totalDurationSeconds / 3600,
                ).toLocaleString("en-US"),
              },
            ]}
          />
        )}
      </WeightliftingOgFrame>
    ),
    { ...size, fonts },
  );
}
