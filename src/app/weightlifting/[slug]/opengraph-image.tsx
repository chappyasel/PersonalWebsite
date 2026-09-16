import { categoryColor } from "../lib/utils";
import {
  WeightliftingOgFrame,
  WeightliftingOgStats,
  formatOgVolume,
  loadWeightliftingOgIcon,
} from "../ogCard";
import { loadWeightliftingOgFonts } from "../ogFonts";
import { ImageResponse } from "next/og";

import { resolveExercise } from "~/server/queries/resolveExercise";
import { getCachedExerciseDetail } from "~/server/queries/weightliftingExercise";

export const runtime = "nodejs";
export const alt = "Exercise history ~ Chappy's Weightlifting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [icon, fonts] = await Promise.all([
    loadWeightliftingOgIcon(),
    loadWeightliftingOgFonts(),
  ]);
  let detail: Awaited<ReturnType<typeof getCachedExerciseDetail>> = null;
  try {
    const resolved = await resolveExercise(slug);
    if (resolved) {
      detail = await getCachedExerciseDetail(
        resolved.allVariants ? resolved.entry.name : resolved.entry.displayName,
        resolved.allVariants,
      );
    }
  } catch (error) {
    console.error("Error loading exercise OG history:", error);
  }

  return new ImageResponse(
    (
      <WeightliftingOgFrame icon={icon}>
        {detail ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                flex: 1,
                padding: "20px 0",
              }}
            >
              <div
                style={{
                  fontFamily: "SF Pro Rounded",
                  fontSize: detail.displayName.length > 32 ? 54 : 76,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {detail.displayName}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 12,
                  fontSize: 40,
                  fontWeight: 600,
                  color: "#404040",
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: categoryColor(detail.category),
                  }}
                />
                {detail.category}
              </div>
            </div>
            <WeightliftingOgStats
              stats={[
                {
                  label: detail.best
                    ? `${detail.best.reps} × ${Math.round(detail.best.weight)}`
                    : "No recorded max",
                  value: detail.best
                    ? Math.round(detail.best.oneRM).toLocaleString("en-US")
                    : "N/A",
                  unit: detail.best ? "lbs" : undefined,
                },
                {
                  label: "Total volume",
                  value: formatOgVolume(detail.totalVolume),
                  unit: "lbs",
                },
                {
                  label: "Total sets",
                  value: detail.totalSets.toLocaleString("en-US"),
                },
              ]}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              marginTop: 80,
              fontSize: 40,
              color: "#404040",
            }}
          >
            Exercise history
          </div>
        )}
      </WeightliftingOgFrame>
    ),
    { ...size, fonts },
  );
}
