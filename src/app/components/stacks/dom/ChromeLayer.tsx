"use client";

// Screen-fixed chrome over the world: shared styles, bottom vignette, the
// persistent name, and the theme toggle island. Everything except the toggle
// island is pointer-events-none; interactive layers manage their own events.
import {
  requestDevHooks,
  requestSceneHooks,
  sceneDiagnosticsQueryMode,
} from "../scene/devHooks";
import {
  connectFreeRoamEntryObserver,
  freeRoamDiagnosticsController,
} from "../scene/freeRoamDiagnostics";
import { freeRoamShortcutIntent } from "../scene/freeRoamShortcut";
import {
  sceneLayoutEditorController,
  sceneLayoutNudgeForKeyboard,
} from "../scene/sceneLayoutEditor";
import { setStacksSheetDismissed, useStacks } from "../store";
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

export function ChromeReveal({
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
      style={
        {
          "--stacks-reveal-delay": `${index * 130}ms`,
        } as React.CSSProperties
      }
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
 * scene probes. Production loads the same cheap monitor for ?hud=1; H and
 * ?debug=1 opt into the full instrumented console. */
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
    if (process.env.NODE_ENV !== "development") return;

    const disconnectFreeRoamEntry = connectFreeRoamEntryObserver({
      controller: freeRoamDiagnosticsController,
      // A free-roam camera flies straight out of the mobile sheet's frame, so
      // the sheet is only in the way once free roam owns the view. The layout
      // editor rides along with it: free roam is how the owner reaches props.
      onEnabled: () => {
        sceneLayoutEditorController.setEnabled(true);
        setStacksSheetDismissed(true);
      },
    });
    const onFreeRoamShortcut = (event: KeyboardEvent) => {
      const intent = freeRoamShortcutIntent(
        {
          key: event.key,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          repeat: event.repeat,
          defaultPrevented: event.defaultPrevented,
          editableTarget: isEditableShortcutTarget(event.target),
        },
        freeRoamDiagnosticsController.getSnapshot(),
      );
      if (!intent) return;

      event.preventDefault();
      if (intent.action === "start-from-current-pose") {
        freeRoamDiagnosticsController.startFromCurrentPose();
      } else {
        freeRoamDiagnosticsController.toggle();
      }
      if (intent.requestPointerLock) {
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".stacks-canvas-shell canvas",
        );
        void canvas?.requestPointerLock();
      }
    };
    const onLayoutNudge = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target))
        return;
      if (
        !event.altKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        const changed = event.shiftKey
          ? sceneLayoutEditorController.redo()
          : sceneLayoutEditorController.undo();
        if (changed) event.preventDefault();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "r") {
        if (sceneLayoutEditorController.setMode("rotate"))
          event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === "g") {
        if (sceneLayoutEditorController.setMode("translate"))
          event.preventDefault();
        return;
      }
      const delta = sceneLayoutNudgeForKeyboard(event);
      if (!delta || !sceneLayoutEditorController.nudgeSelected(delta)) return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onFreeRoamShortcut);
    window.addEventListener("keydown", onLayoutNudge);
    return () => {
      disconnectFreeRoamEntry();
      window.removeEventListener("keydown", onFreeRoamShortcut);
      window.removeEventListener("keydown", onLayoutNudge);
    };
  }, []);

  useEffect(() => {
    const queryMode = sceneDiagnosticsQueryMode(window.location.search);
    if (process.env.NODE_ENV === "development" || queryMode === "hud")
      requestSceneHooks();
    if (queryMode === "debug" && request?.initiallyOpen !== true) {
      requestDevHooks();
      setRequest({ initiallyOpen: true });
      return;
    }
    if (queryMode === "hud" && request === null) {
      // The canvas installs only its cheap read hooks for this URL. Loading the
      // compact HUD must not signal full instrumentation, which would mount
      // frame tracing, matrix timing and the perch sweep.
      setRequest({ initiallyOpen: false });
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
        event.key.toLowerCase() !== "h" ||
        isEditableShortcutTarget(event.target)
      )
        return;

      event.preventDefault();
      if (document.pointerLockElement !== null) document.exitPointerLock();
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
        // A later H press should be able to retry a transient chunk failure.
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
          animation-delay: var(--stacks-reveal-delay, 0ms);
        }
        .stacks-world-shell[data-load-path="warm"][data-revealed] .stacks-reveal {
          animation-duration: 0.58s;
        }
        @media (width >= 1200px) {
          /* On desktop the name clears the left curtain first, the rail
             follows, and the utility controls close the sequence. Mobile
             keeps its existing compact timing. */
          .stacks-world-shell[data-revealed]
            .stacks-wordmark
            .stacks-reveal {
            animation-duration: 700ms;
            animation-delay: 440ms;
          }
          .stacks-world-shell[data-revealed]
            .stacks-theme-toggle
            .stacks-reveal {
            animation-duration: 560ms;
            animation-delay: 800ms;
          }
          .stacks-world-shell[data-load-path="warm"][data-revealed]
            .stacks-wordmark
            .stacks-reveal {
            animation-duration: 460ms;
            animation-delay: 150ms;
          }
          .stacks-world-shell[data-load-path="warm"][data-revealed]
            .stacks-theme-toggle
            .stacks-reveal {
            animation-duration: 400ms;
            animation-delay: 360ms;
          }
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
      `}</style>
      {/* Composer-off fallback vignette. Black in BOTH themes (round 3: the
          white light-mode version read as ground fog over the meadow) and
          half the old strength — a grounding shadow, not a fog bank. */}
      {!postfx && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[12dvh] bg-gradient-to-t from-black/45 to-transparent" />
      )}
      <div className="stacks-wordmark pointer-events-none absolute z-20">
        <div className="flex items-start gap-2.5">
          <ChromeReveal index={0}>
            <p className="stacks-on-background-text whitespace-nowrap font-serif text-base tracking-tight text-foreground min-[1200px]:text-lg">
              Chappy Asel
            </p>
          </ChromeReveal>
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
        <ChromeReveal index={2} className="stacks-scene-controls">
          <ThemeToggle className="stacks-on-background-text !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
          <SoundToggle className="stacks-on-background-text !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
        </ChromeReveal>
      </div>
    </>
  );
}
