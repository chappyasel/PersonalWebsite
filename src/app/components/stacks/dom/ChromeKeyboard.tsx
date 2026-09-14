"use client";

// The visitor-facing keys over the room and the tooltip that lists them. This
// is its own component, outside SceneDiagnosticsLoader, because that one's
// listeners are development-only and these keys have to work in production.
// See chromeKeys.ts for the map and the reasoning behind each key.
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import {
  screenshotDollyKeyDelta,
  screenshotModeController,
  useScreenshotMode,
} from "../scene/screenshotMode";
import { Fragment, useEffect, useRef } from "react";

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
  const helpOpenRef = useRef(open);
  helpOpenRef.current = open;

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
      // An open help tooltip takes Escape first; otherwise Escape is
      // only ours while the interface is hidden.
      if (
        event.key === "Escape" &&
        helpOpenRef.current &&
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
        // Reveal the name and its help tooltip if the interface was hidden.
        setChromeHidden(false);
        onOpenChange(!helpOpenRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setChromeHidden(false);
    };
  }, [onOpenChange]);

  return null;
}

export function ChromeShortcutList() {
  const screenshotMode = useScreenshotMode();
  const groups = shortcutGroups(
    process.env.NODE_ENV === "development",
    screenshotMode.enabled,
  );
  return (
    <div className="w-max max-w-[min(24rem,calc(100vw-3rem))] text-left">
      {groups.map((group, index) => (
        <section key={group.title} className={index ? "mt-4" : ""}>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-inherit opacity-60">
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
    </div>
  );
}
