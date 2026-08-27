import { ImageResponse } from "next/og";

import { loadGeorgiaProBold } from "~/app/books/[bookId]/fonts";
import {
  getCachedExerciseDetail,
  getCachedExerciseIndex,
} from "~/server/queries/weightliftingExercise";

export const runtime = "nodejs";

export const alt = "Exercise history ~ Chappy's Weightlifting";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${Math.round(lbs / 1_000)}K`;
  return lbs.toLocaleString();
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const index = await getCachedExerciseIndex();
    const entry = index.find((e) => e.slug === slug);
    const detail = entry
      ? await getCachedExerciseDetail(entry.displayName)
      : null;
    const fontBold = await loadGeorgiaProBold();

    if (!detail) throw new Error(`No exercise for slug: ${slug}`);

    const statItems = [
      { label: "Instances", value: detail.instanceCount.toLocaleString() },
      { label: "Sets", value: detail.totalSets.toLocaleString() },
      { label: "Volume", value: `${formatVolume(detail.totalVolume)} lbs` },
      { label: "Since", value: detail.firstPerformed.slice(0, 4) },
    ];

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            backgroundColor: "#1a1a1a",
            justifyContent: "center",
            padding: "50px 80px",
            fontFamily: '"Georgia Pro"',
            color: "#e5e5e5",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontSize: "26px",
              color: "#888888",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "20px",
            }}
          >
            Chappy&apos;s Weightlifting
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              textAlign: "center",
              // scale long names down so the composition never overflows
              fontSize: detail.displayName.length > 28 ? "44px" : "62px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              marginBottom: "40px",
            }}
          >
            {detail.displayName}
          </div>

          {detail.best && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                marginBottom: "48px",
              }}
            >
              <div
                style={{ fontSize: "76px", fontWeight: 700, color: "#ffffff" }}
              >
                {`${Math.round(detail.best.oneRM)} lbs`}
              </div>
              <div style={{ display: "flex", fontSize: "24px", color: "#666666" }}>
                {`${detail.best.reps} x ${Math.round(detail.best.weight)} est. 1RM`}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "72px",
              borderTop: "1px solid #333333",
              paddingTop: "40px",
            }}
          >
            {statItems.map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <div
                  style={{ fontSize: "40px", fontWeight: 700, color: "#ffffff" }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    color: "#888888",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      {
        ...size,
        fonts: [
          { name: "Georgia Pro", data: fontBold, weight: 700, style: "normal" },
        ],
      },
    );
  } catch (error) {
    console.error("Error generating exercise OG image:", error);
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "#1a1a1a",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: "64px",
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          Chappy&apos;s Weightlifting
        </div>
      ),
      { ...size },
    );
  }
}
