"use client";

// Screen-fixed chrome over the world: shared styles (scrollbar hiding, grain
// reveal), animated film grain, bottom vignette, the persistent name, and
// the theme toggle island. Everything except the toggle island is
// pointer-events-none; interactive layers manage their own events.
import { useStacks } from "../store";
import { GRAIN_URI } from "../theme";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import DoorLabel from "./DoorLabel";

export function GrainReveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`stacks-reveal ${className ?? ""}`}
      style={{ animationDelay: `${index * 130}ms` }}
    >
      {children}
    </div>
  );
}

type DevHudSnapshot = {
  fps: number;
  p50: number;
  p95: number;
  durable: number | null;
  forced: boolean | null;
  moving: boolean | null;
  postprocessing: string | null;
  dpr: number | null;
  framebuffer: string | null;
  calls: number | null;
  triangles: number | null;
  textures: number | null;
  programs: number | null;
};

const EMPTY_DEV_HUD: DevHudSnapshot = {
  fps: 0,
  p50: 0,
  p95: 0,
  durable: null,
  forced: null,
  moving: null,
  postprocessing: null,
  dpr: null,
  framebuffer: null,
  calls: null,
  triangles: null,
  textures: null,
  programs: null,
};

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function rendererSnapshot(): Omit<DevHudSnapshot, "fps" | "p50" | "p95"> {
  const state = window.__stacks?.state();
  const quality = record(state?.quality);
  const framebuffer = record(state?.framebuffer);
  const buffer = Array.isArray(framebuffer?.buffer) ? framebuffer.buffer : null;
  return {
    durable: numeric(quality?.durable),
    forced: typeof quality?.forced === "boolean" ? quality.forced : null,
    moving: typeof quality?.moving === "boolean" ? quality.moving : null,
    postprocessing:
      typeof quality?.postprocessing === "string"
        ? quality.postprocessing
        : null,
    dpr: numeric(state?.dpr) ?? numeric(quality?.effectiveDpr),
    framebuffer:
      buffer && numeric(buffer[0]) != null && numeric(buffer[1]) != null
        ? `${numeric(buffer[0])}×${numeric(buffer[1])}`
        : null,
    calls: numeric(state?.calls),
    triangles: numeric(state?.triangles),
    textures: numeric(state?.textures),
    programs: numeric(state?.programs),
  };
}

function percentile(sorted: number[], portion: number) {
  if (sorted.length === 0) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * portion) - 1)
  ]!;
}

function compactCount(value: number | null) {
  if (value == null) return "–";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

/** A live, self-contained development readout. It deliberately samples RAF
 * cadence rather than the opt-in performance harness, so it remains useful
 * while visually inspecting ordinary navigation. */
function DevPerformanceHud() {
  const [snapshot, setSnapshot] = useState(EMPTY_DEV_HUD);
  const samples = useRef<number[]>([]);

  useEffect(() => {
    let animationFrame = 0;
    let previousFrame = performance.now();
    let lastPublish = previousFrame;

    const frame = (now: number) => {
      const elapsed = now - previousFrame;
      previousFrame = now;
      // Ignore long background-tab pauses; they describe visibility, not the
      // scene's steady rendering performance.
      if (elapsed > 0 && elapsed < 1_000) {
        samples.current.push(elapsed);
        if (samples.current.length > 240) samples.current.shift();
      }

      if (now - lastPublish >= 500) {
        const frameTimes = [...samples.current].sort((a, b) => a - b);
        const mean =
          frameTimes.reduce((total, value) => total + value, 0) /
          Math.max(1, frameTimes.length);
        setSnapshot({
          fps: mean > 0 ? 1_000 / mean : 0,
          p50: percentile(frameTimes, 0.5),
          p95: percentile(frameTimes, 0.95),
          ...rendererSnapshot(),
        });
        lastPublish = now;
      }
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const quality = snapshot.durable == null ? "Q–" : `Q${snapshot.durable}`;
  const movement =
    snapshot.moving == null ? "waiting" : snapshot.moving ? "moving" : "still";
  const qualityMode = snapshot.forced ? "forced" : "auto";

  return (
    <output
      className="stacks-dev-hud pointer-events-none"
      aria-label="Development rendering performance"
      title="Development-only rolling rendering metrics"
    >
      <span>
        {Math.round(snapshot.fps)} fps · {snapshot.p50.toFixed(1)}/
        {snapshot.p95.toFixed(1)} ms p50/p95
      </span>
      <span>
        {quality} {qualityMode}/{movement} · FX {snapshot.postprocessing ?? "–"}{" "}
        · DPR {snapshot.dpr?.toFixed(2) ?? "–"} · {snapshot.framebuffer ?? "–"}
      </span>
      <span>
        {compactCount(snapshot.calls)} calls ·{" "}
        {compactCount(snapshot.triangles)} tri ·{" "}
        {compactCount(snapshot.textures)} tex ·{" "}
        {compactCount(snapshot.programs)} prog
      </span>
    </output>
  );
}

export default function ChromeLayer() {
  // The composer's Vignette owns edge darkening while active — stacking the
  // DOM bottom fade on top double-darkens the floor (audit §2.1).
  const postfx = useStacks((s) => s.postfx);
  return (
    <>
      <DoorLabel />
      <style>{`
        :root { --stacks-ease: cubic-bezier(0.16, 1, 0.3, 1); }
        .stacks-scroll { scrollbar-width: none; }
        .stacks-scroll::-webkit-scrollbar { display: none; }
        .stacks-wordmark {
          left: max(1.25rem, env(safe-area-inset-left, 0px));
          top: max(1rem, env(safe-area-inset-top, 0px));
        }
        ${
          process.env.NODE_ENV === "development"
            ? `.stacks-dev-hud {
                display: grid;
                gap: 1px;
                min-width: max-content;
                padding: 4px 6px;
                border: 1px solid rgb(255 255 255 / 0.16);
                border-radius: 5px;
                color: rgb(255 255 255 / 0.88);
                background: rgb(4 10 18 / 0.42);
                box-shadow: 0 1px 5px rgb(0 0 0 / 0.24);
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 8px;
                font-variant-numeric: tabular-nums;
                font-weight: 500;
                letter-spacing: -0.01em;
                line-height: 1.12;
                text-shadow: 0 1px 2px rgb(0 0 0 / 0.75);
                white-space: nowrap;
                backdrop-filter: blur(4px);
              }`
            : ""
        }
        .stacks-theme-toggle {
          right: max(1rem, env(safe-area-inset-right, 0px));
          top: max(0.75rem, env(safe-area-inset-top, 0px));
        }
        /* Light-mode chrome sits directly on a scene whose value changes
           from sky to grass. Use the Systems quote treatment here too:
           white ink plus a restrained black halo, rather than a page-theme
           foreground that can disappear over either end of the meadow. */
        html:not(.dark) .stacks-on-background-text {
          color: rgb(255 255 255 / 0.94) !important;
          text-shadow: 0 1px 3px rgb(0 0 0 / 0.55), 0 0 14px rgb(0 0 0 / 0.4);
          --tw-ring-color: rgb(255 255 255 / 0.48);
        }
        html:not(.dark) .stacks-on-background-text svg {
          filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.55)) drop-shadow(0 0 7px rgb(0 0 0 / 0.4));
        }
        html:not(.dark) .stacks-on-background-mark {
          background-color: rgb(255 255 255 / 0.9) !important;
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.45), 0 0 10px rgb(0 0 0 / 0.3);
        }
        @media (width >= 1200px) {
          .stacks-wordmark {
            left: max(1.75rem, env(safe-area-inset-left, 0px));
            top: max(1.25rem, env(safe-area-inset-top, 0px));
          }
          .stacks-theme-toggle {
            bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
            left: max(2rem, env(safe-area-inset-left, 0px));
            right: auto;
            top: auto;
          }
        }
        .stacks-reveal {
          opacity: 0;
        }
        .stacks-world-shell[data-revealed] .stacks-reveal {
          animation: stacks-resolve 0.9s var(--stacks-ease) forwards;
        }
        .stacks-world-shell[data-load-path="warm"][data-revealed] .stacks-reveal {
          animation-duration: 0.58s;
        }
        @keyframes stacks-resolve {
          from { opacity: 0; filter: blur(14px); transform: translateY(12px); }
          to { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .stacks-reveal,
          .stacks-world-shell[data-revealed] .stacks-reveal {
            opacity: 1;
            animation: none;
            filter: none;
            transform: none;
          }
        }
        .stacks-grain {
          position: absolute;
          inset: -5%;
          background-size: 180px;
          opacity: 0.06;
        }
        @media (prefers-reduced-motion: no-preference) {
          .stacks-grain {
            animation: stacks-grain-jitter 0.7s steps(1) infinite;
          }
        }
        @keyframes stacks-grain-jitter {
          0% { transform: translate3d(0, 0, 0); }
          12.5% { transform: translate3d(-2.6%, -1.6%, 0); }
          25% { transform: translate3d(1.8%, -2.9%, 0); }
          37.5% { transform: translate3d(-3.4%, 2.2%, 0); }
          50% { transform: translate3d(2.9%, 1.4%, 0); }
          62.5% { transform: translate3d(-1.2%, 3.1%, 0); }
          75% { transform: translate3d(3.3%, -0.9%, 0); }
          87.5% { transform: translate3d(-2.1%, -3.2%, 0); }
        }
      `}</style>
      {/* Grain jitters via compositor transform only — animating seed or
          background-position forces CPU repaints. The wrapper clips the 110%
          oversize so jitter never exposes an edge. */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        <div className="stacks-grain" style={{ backgroundImage: GRAIN_URI }} />
      </div>
      {/* Composer-off fallback vignette. Black in BOTH themes (round 3: the
          white light-mode version read as ground fog over the meadow) and
          half the old strength — a grounding shadow, not a fog bank. */}
      {!postfx && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[12dvh] bg-gradient-to-t from-black/45 to-transparent" />
      )}
      <div className="stacks-wordmark pointer-events-none absolute z-20">
        <div className="flex items-start gap-2.5">
          <GrainReveal index={0}>
            <p className="stacks-on-background-text whitespace-nowrap font-serif text-base tracking-tight text-foreground min-[1200px]:text-lg">
              Chappy Asel
            </p>
          </GrainReveal>
          {process.env.NODE_ENV === "development" ? (
            <DevPerformanceHud />
          ) : null}
        </div>
      </div>
      {/* Theme toggle — fixed chrome, not buried in the About placard (audit
          §1.6). z-30 clears the placard dock (z-20); the mobile panel (z-40)
          still covers it while open. No island: over a rendered scene a
          floating panel is one more thing to look at, so the control is just
          the glyph until you reach for it (owner call at browse) — the round
          hover/press wash is the whole affordance.

          MOBILE: this button owns the top-right corner outright. It is a 40px
          box at top-3, so it occupies 12–52px down from the top edge, and the
          name opposite it owns the left of the same strip. Nothing else may
          be placed there. The unit row used to be, at right-4 top-4, and the
          seventh mark sat under this glyph on a 390px phone; it now takes its
          own centred row below 56px (see UnitRail).

          DESKTOP: bottom-left, because top-right is the placard's. The dock
          runs `inset-y-0 right-5` and is 27–31rem wide, so a control in that
          corner is a glyph sitting on the reading column — the owner's "it
          intersects with the content". The bottom of the left gutter is the
          one edge with nothing in it: the rail is vertically centred (7 rows
          of 40px = 280px, so it ends 140px above the middle) and the bottom
          fade is pointer-events-none.

          left-6 / lg:left-8 rather than the rail's own left-5 / lg:left-7 is
          optical, not sloppy: this is a 40px box around a 16px glyph, so its
          centre is 20px in, while the rail's icons start after a 16px thumb
          lane and centre 24px in from the nav's edge. Adding 4px to the box
          puts the two centres on the same vertical line (44px at md, 52px at
          lg), which is what "aligned" means here.

          In DEV ONLY there is also a round "N" Next.js dev-tools button in
          this corner, at roughly 25–55px x, 846–876px y on a 900px window. It
          is not ours, it does not ship, and nothing here is laid out around
          it — but it does sit on top of this glyph in a dev screenshot. */}
      <div className="stacks-theme-toggle pointer-events-auto absolute z-30">
        <GrainReveal index={2}>
          <ThemeToggle className="stacks-on-background-text !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
        </GrainReveal>
      </div>
    </>
  );
}
