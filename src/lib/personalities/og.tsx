import { ImageResponse } from "next/og";

import { norms, traits } from "./data";
import type { SharedSnapshot } from "./sharing";
import {
  loadGeorgiaProBold,
  loadGeorgiaProRegular,
} from "~/app/books/[bookId]/fonts";
import {
  comparisonMetrics,
  traitColors,
} from "~/app/personalities/compare/model";

export async function renderPersonalityOg(snapshot?: SharedSnapshot) {
  const [regular, bold] = await Promise.all([
    loadGeorgiaProRegular(),
    loadGeorgiaProBold(),
  ]);
  const results = snapshot?.results.slice(0, 2) ?? [];
  const [left, right] = results;
  const compatible = results.every(
    (r) =>
      r.testVersion === "ipip-120" &&
      r.scoreKind === "raw" &&
      r.scoreMax === 120,
  );
  const gaps =
    left && right && compatible
      ? comparisonMetrics(left.scores, right.scores, norms).sort(
          (a, b) => Math.abs(b.deltaSd) - Math.abs(a.deltaSd),
        )
      : [];
  const largest = gaps[0],
    smallest = gaps[gaps.length - 1];
  const extent = Math.max(
    3.4,
    ...traits.flatMap((trait) =>
      [
        ...results.map((r) => r.scores[trait]),
        ...(snapshot?.anonymous?.scores[trait] ?? []),
      ].map(
        (score) =>
          Math.abs((score - norms[trait].mean) / norms[trait].sd) + 0.2,
      ),
    ),
  );
  const title = results.length
    ? results.map((r) => r.label).join(" & ")
    : "Personalities";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f5f3eb",
          color: "#182a2a",
          padding: "40px 48px",
          fontFamily: "Georgia Pro",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 16,
            letterSpacing: 3,
            color: "#67736e",
          }}
        >
          <span>PERSONALITIES</span>
          <span>BIG FIVE</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 28 ? 46 : 64,
            fontWeight: 700,
            marginTop: 22,
            letterSpacing: -2,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", gap: 28, marginTop: 14, fontSize: 19 }}>
          {results.map((r, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                color: index ? "#398b82" : "#182a2a",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: index ? 0 : 10,
                  transform: index ? "rotate(45deg)" : "rotate(0deg)",
                  background: index ? "#398b82" : "#182a2a",
                }}
              />
              {r.label}
            </div>
          ))}
          {snapshot?.anonymous && snapshot.anonymous.count > 0 && (
            <div
              style={{
                display: "flex",
                color: "#8a9292",
                alignItems: "center",
                gap: 9,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 10,
                  background: "#8a9292",
                }}
              />
              {snapshot.anonymous.count} others
            </div>
          )}
          {!results.length && <span>Personality, side by side.</span>}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
          {traits.map((trait) => {
            const n = norms[trait];
            const color = traitColors[trait];
            const points = compatible
              ? [
                  ...results.map((r, index) => ({
                    z: (r.scores[trait] - n.mean) / n.sd,
                    named: true,
                    index,
                  })),
                  ...(snapshot?.anonymous?.scores[trait] ?? []).map(
                    (score) => ({
                      z: (score - n.mean) / n.sd,
                      named: false,
                      index: -1,
                    }),
                  ),
                ]
              : [];
            const x = (z: number) => 8 + ((z + extent) / (2 * extent)) * 180;
            const y = (z: number) => 84 - Math.exp((-z * z) / 2) * 62;
            const path = Array.from({ length: 81 }, (_, i) => {
              const z = -extent + (i / 80) * extent * 2;
              return `${i ? "L" : "M"}${x(z)},${y(z)}`;
            }).join(" ");
            const lanes: number[][] = [];
            const dots = points
              .sort((a, b) => a.z - b.z)
              .map((p) => {
                const px = x(p.z);
                let lane = lanes.findIndex((values) =>
                  values.every((v) => Math.abs(v - px) > 8),
                );
                if (lane < 0) {
                  lane = lanes.length;
                  lanes.push([]);
                }
                lanes[lane]!.push(px);
                return { ...p, px, py: 100 + lane * 8 };
              });
            return (
              <div
                key={trait}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: 211,
                  height: 245,
                  background: "#fffef8",
                  border: "1px solid #dfdfd3",
                  borderRadius: 12,
                  padding: "16px 10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    color,
                    fontSize: trait === "Conscientiousness" ? 16 : 19,
                  }}
                >
                  {trait}
                </div>
                <svg
                  width="190"
                  height="154"
                  viewBox={`0 0 196 ${Math.max(145, 118 + lanes.length * 8)}`}
                >
                  <path
                    d={`${path} L188,84 L8,84 Z`}
                    fill={color}
                    fillOpacity="0.1"
                  />
                  <line
                    x1={x(0)}
                    x2={x(0)}
                    y1="15"
                    y2="87"
                    stroke="#cbd0c6"
                    strokeDasharray="3 4"
                  />
                  <path d={path} fill="none" stroke={color} strokeWidth="2" />
                  <line x1="8" x2="188" y1="84" y2="84" stroke="#d5dbd0" />
                  {dots.map((p, i) => (
                    <g key={i}>
                      {p.named && (
                        <line
                          x1={p.px}
                          x2={p.px}
                          y1={y(p.z)}
                          y2={p.py - 5}
                          stroke={p.index ? "#398b82" : "#182a2a"}
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />
                      )}
                      {p.index === 1 ? (
                        <path
                          d={`M${p.px},${p.py - 5} l5,5 l-5,5 l-5,-5 Z`}
                          fill="#398b82"
                        />
                      ) : (
                        <circle
                          cx={p.px}
                          cy={p.py}
                          r={p.named ? 4.5 : 2.5}
                          fill={p.named ? "#182a2a" : "#9fa6a1"}
                        />
                      )}
                    </g>
                  ))}
                </svg>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 30,
                    fontSize: 30,
                    fontWeight: 700,
                  }}
                >
                  {results.map((r, i) => (
                    <span key={i} style={{ color: i ? "#398b82" : "#182a2a" }}>
                      {r.scores[trait]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 25,
            fontSize: 19,
          }}
        >
          {largest && smallest ? (
            <div
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex" }}>
                Biggest gap: {largest.trait} ·{" "}
                {Math.abs(largest.deltaSd).toFixed(2)} SD
              </div>
              <div style={{ display: "flex" }}>
                Smallest: {smallest.trait} ·{" "}
                {Math.abs(smallest.deltaSd).toFixed(2)} SD
              </div>
            </div>
          ) : (
            <span>Five traits. One shared view.</span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            color: "#89918b",
            fontSize: 14,
          }}
        >
          {compatible && results.length
            ? "IPIP-120 · Raw scores / 120"
            : "chappyasel.com"}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "private, no-store" },
      fonts: [
        { name: "Georgia Pro", data: regular, weight: 400 },
        { name: "Georgia Pro", data: bold, weight: 700 },
      ],
    },
  );
}
