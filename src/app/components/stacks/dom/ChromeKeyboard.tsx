"use client";

// The visitor-facing keys over the room and the sheet that lists them. This
// is its own component, outside SceneDiagnosticsLoader, because that one's
// listeners are development-only and these keys have to work in production.
// See chromeKeys.ts for the map and the reasoning behind each key.
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import { useEffect, useRef, useState } from "react";

import {
  chromeHidden,
  chromeKeyEventFrom,
  chromeKeyIntent,
  setChromeHidden,
  shortcutGroups,
} from "./chromeKeys";

export default function ChromeKeyboard() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const editable = isEditableShortcutTarget(event.target);
      // An open sheet takes Escape first; with the sheet closed Escape is
      // only ours while the interface is hidden.
      if (
        event.key === "Escape" &&
        sheetOpenRef.current &&
        !editable &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        setSheetOpen(false);
        return;
      }
      const intent = chromeKeyIntent(
        chromeKeyEventFrom(event, editable),
        chromeHidden(),
      );
      if (intent === "hide-all") {
        event.preventDefault();
        setChromeHidden(!chromeHidden());
        setSheetOpen(false);
      } else if (intent === "show-all") {
        event.preventDefault();
        setChromeHidden(false);
      } else if (intent === "sheet") {
        event.preventDefault();
        // The sheet lives inside the hidden wrapper, so asking for it while
        // the interface is hidden brings the interface back with it.
        setChromeHidden(false);
        setSheetOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setChromeHidden(false);
    };
  }, []);

  if (!sheetOpen) return null;
  const groups = shortcutGroups(process.env.NODE_ENV === "development");
  return (
    // Absolute, not fixed: the world shell is a transformed, paint-contained
    // ancestor, so fixed would resolve against it anyway and clip. The shell
    // is the viewport.
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      onClick={() => setSheetOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
        className="stacks-glass-tooltip w-full max-w-xs rounded-xl border px-5 py-4 font-serif text-sm text-foreground shadow-lg"
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
                    {row.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-foreground/20 bg-foreground/5 px-1.5 py-px font-sans text-[11px] leading-5 text-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-[13px] leading-5">{row.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
