"use client";

// The visitor-facing keys over the room and the sheet that lists them. This
// is its own component, outside SceneDiagnosticsLoader, because that one's
// listeners are development-only and these keys have to work in production.
// See chromeKeys.ts for the map and the reasoning behind each key.
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import {
  effectivePlacardGlassMode,
  useScenePerformanceSettings,
} from "../scene/scenePerformance";
import {
  screenshotDollyKeyDelta,
  screenshotModeController,
  useScreenshotMode,
} from "../scene/screenshotMode";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Fragment, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { useTapFirstCapability } from "~/lib/useTapFirstCapability";

import { Keycap } from "~/components/ui/keycap";

import {
  chromeHidden,
  chromeKeyEventFrom,
  chromeKeyIntent,
  setChromeHidden,
  shortcutGroups,
} from "./chromeKeys";

export default function ChromeKeyboard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const performanceSettings = useScenePerformanceSettings();
  const coarseTouchCapability = useTapFirstCapability();
  const glassMode = effectivePlacardGlassMode(
    performanceSettings.placardGlassMode,
    coarseTouchCapability,
  );
  const sheetOpenRef = useRef(open);
  sheetOpenRef.current = open;
  const screenshotMode = useScreenshotMode();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.documentElement.hasAttribute("data-field-notes-open"))
        return;
      const editable = isEditableShortcutTarget(event.target);
      // The screenshot dolly, only while the mode is on. Read from the
      // controller rather than the render so a key pressed in the same
      // frame the mode flips still lands on the right answer.
      if (screenshotModeController.getSnapshot().enabled) {
        const delta = screenshotDollyKeyDelta({
          key: event.key,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          defaultPrevented: event.defaultPrevented,
          editableTarget: editable,
        });
        if (delta !== null) {
          event.preventDefault();
          screenshotModeController.nudgeDolly(delta);
          return;
        }
      }
      // An open sheet takes Escape first; with the sheet closed Escape is
      // only ours while the interface is hidden.
      if (
        event.key === "Escape" &&
        sheetOpenRef.current &&
        !editable &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      const intent = chromeKeyIntent(
        chromeKeyEventFrom(event, editable),
        chromeHidden(),
      );
      if (intent === "hide-all") {
        event.preventDefault();
        setChromeHidden(!chromeHidden());
        onOpenChange(false);
      } else if (intent === "show-all") {
        event.preventDefault();
        setChromeHidden(false);
      } else if (intent === "sheet") {
        event.preventDefault();
        // This shortcut also recovers hidden scene chrome, so opening the
        // portaled sheet brings the rest of the interface back with it.
        setChromeHidden(false);
        onOpenChange(!sheetOpenRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setChromeHidden(false);
    };
  }, [onOpenChange]);

  if (typeof document === "undefined") return null;

  const groups = shortcutGroups(
    process.env.NODE_ENV === "development",
    screenshotMode.enabled,
  );
  return createPortal(
    // Render true overlays at the document root. Scene chrome may acquire a
    // filter, opacity, or transform during its own transitions; any one of
    // those can become a backdrop root and cut this card off from the WebGL
    // room it needs to sample.
    <div
      data-stacks-glass-mode={glassMode}
      data-stacks-glass-preference={performanceSettings.placardGlassMode}
      className={`fixed inset-0 z-[1000] flex items-center justify-center p-6 ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      onClick={() => onOpenChange(false)}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="stacks-keyboard-shortcuts"
            role="dialog"
            aria-modal="false"
            aria-label="Keyboard shortcuts"
            onClick={(event) => event.stopPropagation()}
            className="stacks-glass-tooltip stacks-keyboard-sheet relative w-full max-w-xs rounded-xl border px-5 py-4 font-serif text-sm text-foreground shadow-lg"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 5 }
            }
            transition={{
              duration: reduceMotion ? 0 : open ? 0.22 : 0.18,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {groups.map((group, index) => (
              <section key={group.title} className={index ? "mt-4" : ""}>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {group.title}
                </h2>
                <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
                  {group.rows.map((row) => (
                    <div key={row.does} className="contents">
                      <dt className="flex items-center gap-1">
                        {row.keys.map((key, index) => (
                          <Fragment key={key}>
                            {index > 0 && row.join ? (
                              <span aria-hidden="true" className="text-[10px]">
                                {row.join}
                              </span>
                            ) : null}
                            <Keycap width="fit">{key}</Keycap>
                          </Fragment>
                        ))}
                      </dt>
                      <dd className="text-[13px] leading-5">{row.does}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
