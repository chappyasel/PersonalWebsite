/** Generate the static share card without reading personal measurements. */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import React from "react";
import satori from "satori";

const svg = await satori(
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      background: "#f5f3ee",
      color: "#242724",
      padding: "62px 76px",
      fontFamily: "Georgia",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 24,
        color: "#676e65",
      }}
    >
      <span>CHAPPY ASEL</span>
      <span>chappyasel.com</span>
    </div>
    <div style={{ fontSize: 82, letterSpacing: "-3px", marginTop: 24 }}>
      Weight Log
    </div>
    <div style={{ fontSize: 27, color: "#676e65", marginTop: 10 }}>
      Bodyweight history · Training phases · DEXA scans
    </div>
    <svg
      width="1048"
      height="230"
      viewBox="0 0 1048 230"
      style={{ marginTop: 26 }}
    >
      {[35, 85, 135, 185].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="1048"
          y2={y}
          stroke="#ddded6"
          strokeWidth="1"
        />
      ))}
      <path
        d="M0 165 C40 174 55 133 90 140 S145 112 175 122 S230 76 265 86 S310 43 350 50"
        stroke="#bf6262"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M350 50 C390 44 404 88 440 80 S490 117 525 112 S570 151 610 140"
        stroke="#638eb4"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M610 140 C655 131 660 144 705 136 S750 145 785 135"
        stroke="#b49a43"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M785 135 C825 140 845 108 875 115 S925 73 960 78 S1010 40 1048 42"
        stroke="#bf6262"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M0 190 C200 178 220 167 350 164 S510 194 610 181 S820 170 1048 161"
        stroke="#9473ad"
        strokeWidth="3"
        strokeDasharray="7 9"
        fill="none"
      />
    </svg>
    <div style={{ display: "flex", gap: 30, fontSize: 20, marginTop: 8 }}>
      <span style={{ color: "#a44e4e" }}>Bulk</span>
      <span style={{ color: "#527d9f" }}>Cut</span>
      <span style={{ color: "#917b32" }}>Maintain</span>
      <span style={{ marginLeft: "auto", color: "#81867d" }}>
        An interactive training history
      </span>
    </div>
  </div>,
  {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Georgia",
        data: readFileSync("public/fonts/GeorgiaPro-Bold.ttf"),
        weight: 700,
        style: "normal",
      },
    ],
  },
);
const png = new Resvg(svg).render().asPng();
writeFileSync("public/images/weight-log-og.png", png);
console.log(
  `Generated weight-log-og.png: 1200 × 630, ${Math.round(png.length / 1024)} KB`,
);
