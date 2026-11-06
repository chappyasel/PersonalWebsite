"use client";

import { Confirmation } from "../confirmed/Confirmation";
import { useEffect, useRef, useState } from "react";

const HOST_ZONE = "America/New_York";

/** Next Wednesday at 3pm New York time. */
function nextWednesday() {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() + ((3 - now.getDay() + 7) % 7 || 7));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  // 15:00 in New York, whatever the offset that day.
  const guess = Date.parse(`${y}-${m}-${day}T15:00:00Z`);
  const ny = new Date(
    new Date(guess).toLocaleString("en-US", { timeZone: HOST_ZONE }),
  );
  const utc = new Date(
    new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }),
  );
  return guess + (utc.getTime() - ny.getTime());
}

export function PreviewSwitch() {
  const [run, setRun] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setStart(nextWednesday());
  }, []);

  const flipTheme = () => {
    const html = document.documentElement;
    const dark =
      html.classList.contains("dark") ||
      (!html.classList.contains("light") &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    html.classList.toggle("dark", !dark);
    html.classList.toggle("light", dark);
    setRun((n) => n + 1);
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: "rgb(var(--mt-ink) / 0.06)",
          backdropFilter: "blur(12px)",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          style={{ padding: "6px 12px", borderRadius: 999 }}
        >
          Replay
        </button>
        <button
          type="button"
          onClick={flipTheme}
          style={{ padding: "6px 12px", borderRadius: 999 }}
        >
          Theme
        </button>
      </div>
      {start !== null && (
        <Confirmation
          key={run}
          booked={{
            start,
            end: start + 30 * 60_000,
            title: "Ana 🤝 Chappy",
          }}
          email="ana@example.com"
          host="Chappy"
          hostZone={HOST_ZONE}
          bookerZone={HOST_ZONE}
          call={{ kind: "meet" }}
          headingRef={heading}
          onAnother={() => setRun((n) => n + 1)}
          from={null}
        />
      )}
    </>
  );
}
