"use client";

// What you look at while the room is still arriving.
//
// It is server-rendered and carries no imports beyond React and the
// dependency-free progress observable, because it has to be painted from the
// very first HTML — that is the whole point. A pre-paint script in page.tsx
// sets `data-world="pending"` on <html> when WebGL is available and motion is
// allowed, and the CSS below trades the flat document for this. Without that
// handshake a visitor on a slow connection got the vertical text homepage,
// started reading it, and had it pulled out from under them a few seconds
// later.
//
// The indicator is seven book spines filling a shelf, one per section of the
// world being built. A percentage would have read as software; a shelf is
// what is actually loading. The travelling highlight on the plank is the
// "still working" signal — it is what tells a stalled download apart from a
// finished one, since the spines themselves hold position.
import { useSyncExternalStore } from "react";

import { getLoadProgress, subscribeLoadProgress } from "../loading";

/** Where the CSS estimate hands over to real asset progress.
 *
 * Nothing can report progress while the WebGL chunk itself is downloading —
 * three's loading manager does not exist yet — so that stretch is estimated,
 * and the estimate lives in CSS rather than here. It has to: on a throttled
 * 1.2 Mbps connection the chunk took eighteen seconds, and for the first ten
 * of those React had not hydrated, so a JS-driven estimate left the shelf
 * completely empty through the part of the wait that most needed filling.
 * The four keyframe delays in globals.css are solved from the same curve this
 * constant caps, so the handover doesn't jump. */
const ESTIMATE_CEILING = 0.55;

/** One per unit in the world. Widths and heights vary because a shelf of
 * identical spines reads as a progress bar wearing a costume. */
const SPINES = [
  { w: 11, h: 46, tone: 0 },
  { w: 8, h: 38, tone: 1 },
  { w: 14, h: 52, tone: 2 },
  { w: 9, h: 42, tone: 1 },
  { w: 12, h: 34, tone: 3 },
  { w: 8, h: 48, tone: 0 },
  { w: 13, h: 40, tone: 2 },
];

const serverSnapshot = () => 0;

export default function BootScreen() {
  const progress = useSyncExternalStore(
    subscribeLoadProgress,
    getLoadProgress,
    serverSnapshot,
  );
  // A spine lands once the fill passes its slot. `data-in` only ever ADDS —
  // it sets the same end state the CSS estimate animates to, so a spine the
  // estimate already placed cannot be taken back off the shelf when the real
  // numbers arrive.
  const filled =
    progress > 0
      ? (ESTIMATE_CEILING + (1 - ESTIMATE_CEILING) * progress) * SPINES.length
      : 0;
  return (
    <div className="stacks-boot" aria-hidden>
      <div className="stacks-boot-shelf">
        <div className="stacks-boot-spines">
          {SPINES.map((spine, i) => (
            <span
              key={i}
              data-in={filled >= i + 0.35 ? "" : undefined}
              data-tone={spine.tone}
              style={
                { width: spine.w, height: spine.h, "--i": i } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className="stacks-boot-plank" />
      </div>
    </div>
  );
}
