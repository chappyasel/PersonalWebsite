import type { ReactNode } from "react";

import { loadPublicImage } from "~/lib/icons/publicImage";
import { SECTION_ICONS } from "~/lib/icons/sectionIcons";

export async function loadWeightliftingOgIcon() {
  const spec = SECTION_ICONS.weightlifting;
  if (spec.kind !== "image")
    throw new Error("Weightlifting requires its app icon");
  return loadPublicImage(spec.light.png);
}

export function WeightliftingOgFrame({
  icon,
  children,
  centered = false,
}: {
  icon: string;
  children: ReactNode;
  centered?: boolean;
}) {
  const iconSize = centered ? 112 : 80;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: centered ? "center" : "flex-start",
        width: "100%",
        height: "100%",
        padding: "36px 56px",
        backgroundColor: "#fafafa",
        color: "#171717",
        fontFamily: "SF Pro Display",
        fontWeight: 400,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: centered ? "center" : "flex-start",
          gap: centered ? 28 : 22,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt="Weightlifting App"
          width={iconSize}
          height={iconSize}
          style={{ borderRadius: centered ? 28 : 20, flexShrink: 0 }}
        />
        <div
          style={{
            fontFamily: "SF Pro Rounded",
            fontSize: centered ? 84 : 56,
            fontWeight: 700,
            letterSpacing: "-0.035em",
          }}
        >
          Chappy&apos;s Weightlifting
        </div>
      </div>
      {children}
    </div>
  );
}

export type WeightliftingOgStat = {
  label: string;
  value: string;
  unit?: string;
};

export function WeightliftingOgStats({
  stats,
  centered = false,
}: {
  stats: WeightliftingOgStat[];
  centered?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        marginTop: centered ? 64 : "auto",
        flexWrap: centered ? "wrap" : "nowrap",
        flexShrink: 0,
        padding: centered ? "0 16px" : "24px 32px",
        columnGap: centered ? 0 : 28,
        rowGap: 28,
        ...(centered
          ? {}
          : {
              borderRadius: 24,
              border: "1px solid #e5e5e5",
              backgroundColor: "#ffffff",
            }),
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            display: "flex",
            flexDirection: "column",
            ...(centered ? { width: "50%" } : { flex: 1 }),
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontFamily: "SF Pro Rounded",
              fontSize: centered ? 80 : 84,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              whiteSpace: "nowrap",
            }}
          >
            {stat.value}
            {stat.unit && (
              <span
                style={{
                  fontFamily: "SF Pro Rounded",
                  fontSize: 44,
                  fontWeight: 700,
                  position: "relative",
                  top: -8,
                  letterSpacing: 0,
                  color: "#171717",
                }}
              >
                {stat.unit}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              marginTop: 8,
              color: "#404040",
            }}
          >
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function formatOgVolume(volume: number) {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${Math.round(volume / 1_000)}K`;
  return Math.round(volume).toLocaleString("en-US");
}
