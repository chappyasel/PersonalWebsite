"use client";

import { type CSSProperties, useCallback, useRef, useState } from "react";

/**
 * The scene's easter egg, in 2D: clicking the Golden Gate fires a small
 * burst over the bridge. An invisible tap target sits on the strip's bridge
 * span; each click launches a shell at a slightly different spot, sparks
 * radiating as short warm streaks (styles + animation in daylight.css,
 * behind prefers-reduced-motion like everything else in this sky).
 */

const SPARKS = 14;

type Burst = { id: number; left: number; bottom: number; hue: number };

export default function GgbFireworks() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);

  const fire = useCallback(() => {
    const id = nextId.current++;
    const burst: Burst = {
      id,
      // Over the span: the bridge sits at 8–24% of the strip's width.
      left: 10 + Math.random() * 13,
      bottom: 12 + Math.random() * 5,
      hue: Math.random() < 0.34 ? 6 : 33,
    };
    setBursts((b) => [...b.slice(-3), burst]);
    window.setTimeout(
      () => setBursts((b) => b.filter((x) => x.id !== id)),
      1700,
    );
  }, []);

  return (
    <>
      {/* The sky is aria-hidden decoration, so the tap target stays out of
          the tab order — a hidden handshake, not a control. */}
      <button
        type="button"
        className="dl-ggb-tap"
        aria-label="Fireworks over the Golden Gate"
        tabIndex={-1}
        onClick={fire}
      />
      {bursts.map((b) => (
        <span
          key={b.id}
          className="dl-fw"
          style={
            {
              left: `${b.left}%`,
              bottom: `${b.bottom}vw`,
              "--fw-h": b.hue,
            } as CSSProperties
          }
        >
          <i className="dl-fw-flash" />
          {Array.from({ length: SPARKS }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--fw-a": `${(i * 360) / SPARKS + (i % 2) * 9}deg`,
                  "--fw-d": `${0.62 + ((i * 7) % 5) / 9}`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      ))}
    </>
  );
}
