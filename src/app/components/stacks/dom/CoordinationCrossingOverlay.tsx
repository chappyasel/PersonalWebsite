"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  COORDINATION_ARRIVAL_HREF,
  CROSSING_BLOCK_ID,
  CROSSING_MARK_SCALE,
  CROSSING_TIMELINE as T,
  CROSSING_TOKENS,
  type CrossingRun,
  coordinationCrossing,
} from "../scene/coordinationCrossing";

const rgb = (color: readonly number[]) => color.join(" ");

/** The hold frame and the DOM half of the crossing. Timers own the timeline
 * rather than the render loop, so a frozen canvas cannot strand a visitor. */
function ActiveOverlay({ run }: { run: CrossingRun }) {
  useEffect(() => {
    let rest = 0;
    const hold = window.setTimeout(
      () => {
        if (coordinationCrossing.getSnapshot().leaveRoom) {
          window.location.assign(COORDINATION_ARRIVAL_HREF);
          return;
        }
        rest = window.setTimeout(coordinationCrossing.finish, T.previewRest);
      },
      Math.max(0, run.startedAt + T.hold - performance.now()),
    );
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) coordinationCrossing.finish();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(rest);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [run]);

  const tokens = CROSSING_TOKENS[run.theme];
  const accent = rgb(tokens.accent);
  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        pointerEvents: "auto",
      }}
    >
      <style>{`
        .stacks-og-ui > * {
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity ${T.chromeFade}ms ease;
        }
        @keyframes coordination-crossing-appear {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .coordination-crossing-stage {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle, rgb(${rgb(tokens.dot)}) 1px, transparent 1.5px) 0 0 / 16px 16px,
            rgb(${rgb(tokens.ground)});
          opacity: 0;
          animation: coordination-crossing-appear ${T.handoff}ms linear ${T.hold - T.handoff}ms forwards;
        }
        .coordination-crossing-mark {
          position: absolute;
          left: 50%;
          top: 50%;
          width: calc(12ch + 0.12em + 0.75em);
          transform: translate(-50%, -50%);
          scale: ${CROSSING_MARK_SCALE};
          white-space: nowrap;
          font: 600 clamp(32px, 8vw, 72px) / 1.5 ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 0.01em;
        }
        .coordination-crossing-block {
          position: relative;
          display: inline-block;
          width: 0.6em;
          height: 1.15em;
          margin-left: 0.15em;
          vertical-align: -0.2em;
          background: rgb(${accent});
        }
        .coordination-crossing-block::after {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.74;
          box-shadow:
            0 0 0.16em rgb(${accent} / 0.8),
            0 0 0.56em rgb(${accent} / 0.46),
            0 0 1.5em rgb(${accent} / 0.22);
        }
      `}</style>
      <div className="coordination-crossing-stage">
        <div className="coordination-crossing-mark">
          <span id={CROSSING_BLOCK_ID} className="coordination-crossing-block" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CoordinationCrossingOverlay() {
  const run = useSyncExternalStore(
    coordinationCrossing.subscribe,
    () => coordinationCrossing.getSnapshot().run,
    () => null,
  );
  return run ? <ActiveOverlay key={run.id} run={run} /> : null;
}
