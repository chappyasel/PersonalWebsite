"use client";

// Screen-fixed chrome over the world: shared styles (scrollbar hiding, grain
// reveal), animated film grain, bottom vignette, the persistent name, and
// the theme toggle island. Everything except the toggle island is
// pointer-events-none; interactive layers manage their own events.
import { requestDevHooks } from "../scene/devHooks";
import { useStacks } from "../store";
import { GRAIN_URI } from "../theme";
import dynamic from "next/dynamic";
import { type ComponentType, useEffect, useState } from "react";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import DoorLabel from "./DoorLabel";

const SoundToggle = dynamic(
  () => import("./SoundToggle").then((module) => module.SoundToggle),
  {
    ssr: false,
    loading: () => <div aria-hidden className="size-10" />,
  },
);

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

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches("input, select, textarea, [role='textbox']")
  );
}

/** Development keeps the compact HUD visible without enabling the expensive
 * scene probes. Production loads nothing until D or ?debug=1 requests it. */
function SceneDiagnosticsLoader() {
  const [request, setRequest] = useState<{
    initiallyOpen: boolean;
  } | null>(() =>
    process.env.NODE_ENV === "development" ? { initiallyOpen: false } : null,
  );
  const [Diagnostics, setDiagnostics] = useState<ComponentType<{
    initiallyOpen?: boolean;
  }> | null>(null);

  useEffect(() => {
    const debugRequested =
      new URLSearchParams(window.location.search).get("debug") === "1";
    if (debugRequested && request?.initiallyOpen !== true) {
      requestDevHooks();
      setRequest({ initiallyOpen: true });
      return;
    }
    if (request) return;

    const onShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "d" ||
        isEditableShortcutTarget(event.target)
      )
        return;

      event.preventDefault();
      requestDevHooks();
      setRequest({ initiallyOpen: true });
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [request]);

  useEffect(() => {
    if (!request || Diagnostics) return;

    let cancelled = false;
    void import("./SceneDiagnostics")
      .then(({ default: Component }) => {
        if (!cancelled) setDiagnostics(() => Component);
      })
      .catch(() => {
        // A later D press should be able to retry a transient chunk failure.
        if (!cancelled) setRequest(null);
      });

    return () => {
      cancelled = true;
    };
  }, [Diagnostics, request]);

  return request && Diagnostics ? (
    <Diagnostics initiallyOpen={request.initiallyOpen} />
  ) : null;
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
        .stacks-theme-toggle {
          right: max(1rem, env(safe-area-inset-right, 0px));
          top: max(0.75rem, env(safe-area-inset-top, 0px));
        }
        .stacks-scene-controls {
          display: flex;
          flex-direction: row-reverse;
        }
        /* Light-mode chrome sits directly on a scene whose value changes
           from sky to grass. White ink supplies contrast without adding a
           halo to the type. */
        html:not(.dark) .stacks-on-background-text {
          color: rgb(255 255 255 / 0.94) !important;
          --tw-ring-color: rgb(255 255 255 / 0.48);
        }
        /* Rail icons carry an explicit foreground token so desktop and mobile
           remain identical in dark mode. On a light-mode scene, the chrome's
           white ink must win on the SVG itself rather than only its parent. */
        html:not(.dark) .stacks-on-background-text .stacks-rail-icon {
          color: rgb(255 255 255 / 0.94) !important;
        }
        html:not(.dark) .stacks-on-background-mark {
          background-color: rgb(255 255 255 / 0.9) !important;
        }
        @media (width < 1200px) {
          .stacks-wordmark .stacks-on-background-text,
          .stacks-unit-rail-mobile .stacks-on-background-text,
          .stacks-theme-toggle .stacks-on-background-text {
            text-shadow: none !important;
          }
          .stacks-unit-rail-mobile .stacks-on-background-text svg,
          .stacks-theme-toggle svg {
            filter: none !important;
          }
          .stacks-unit-rail-mobile .stacks-on-background-mark {
            box-shadow: none !important;
          }
        }
        @media (width >= 1200px) {
          /* Desktop chrome shares one restrained contact shadow in both
             themes. No element gets the old wide halo treatment. */
          .stacks-wordmark .stacks-on-background-text,
          .stacks-unit-rail-desktop .stacks-on-background-text,
          .stacks-theme-toggle .stacks-on-background-text {
            text-shadow: 0 1px 2px rgb(0 0 0 / 0.28) !important;
          }
          .stacks-unit-rail-desktop .stacks-rail-icon,
          .stacks-theme-toggle svg {
            filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.24)) !important;
          }
          .stacks-unit-rail-desktop .stacks-on-background-mark {
            box-shadow: 0 1px 2px rgb(0 0 0 / 0.28) !important;
          }
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
          .stacks-scene-controls {
            flex-direction: row;
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
          <SceneDiagnosticsLoader />
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
        <GrainReveal index={2} className="stacks-scene-controls">
          <ThemeToggle className="stacks-on-background-text !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
          <SoundToggle className="stacks-on-background-text !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
        </GrainReveal>
      </div>
    </>
  );
}
