"use client";

import { SERVER_WORLD_BOOT_VIEW, worldBoot } from "../boot/worldBootSession";
import {
  type CSSProperties,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  BOOT_WAIT_NOTES,
  BOOT_WAIT_NOTE_INTERVAL_MS,
  BOOT_WAIT_NOTE_LINES,
} from "./bootVignette";

const subscribeWorldBoot = (listener: () => void) =>
  worldBoot.subscribe(listener);
const getWaitStage = () => worldBoot.getView().waitStage;
const getServerWaitStage = () => SERVER_WORLD_BOOT_VIEW.waitStage;
const getBootRevealed = () => worldBoot.getView().revealed;
const getServerBootRevealed = () => SERVER_WORLD_BOOT_VIEW.revealed;

/** Stage updates redraw the notes without redrawing the shelf. The notes stay
 * outside the live region so each rotation does not trigger an announcement. */
export function BootWaitNotes({
  active: enabled = true,
}: {
  active?: boolean;
}) {
  const stage = useSyncExternalStore(
    subscribeWorldBoot,
    getWaitStage,
    getServerWaitStage,
  );
  const revealed = useSyncExternalStore(
    subscribeWorldBoot,
    getBootRevealed,
    getServerBootRevealed,
  );
  const [turn, setTurn] = useState(0);

  // The turn resets with the gate, so every stage opens on its first line
  // rather than wherever the previous stage's rotation happened to leave off.
  // A gate holding one line needs no timer at all, and neither does a boot
  // screen the world has already replaced: the strip is only hidden by CSS, so
  // without the reveal check this would re-render it every 1.2s for the life of
  // the page, behind a running 3D scene.
  useEffect(() => {
    setTurn(0);
    if (!enabled || revealed || BOOT_WAIT_NOTES[stage].length < 2) return;
    const timer = window.setInterval(
      () => setTurn((previous) => previous + 1),
      BOOT_WAIT_NOTE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [enabled, revealed, stage]);

  const active = turn % BOOT_WAIT_NOTES[stage].length;
  return (
    <div className="stacks-boot-wait-notes">
      {BOOT_WAIT_NOTE_LINES.map((line) => (
        <span
          className="stacks-boot-wait-note"
          data-boot-note={
            line.stage === stage && line.index === active ? "active" : "waiting"
          }
          key={line.text}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}

/** Shared by the original vignette, first paint, and the illustrated room. */
export function BootLoadingStatus({
  active = true,
  notes = true,
  ariaLabel,
}: {
  active?: boolean;
  notes?: boolean;
  ariaLabel?: string;
}) {
  return (
    <>
      <p
        className="stacks-boot-wait-label"
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        Loading the 3D room
        <span className="stacks-boot-wait-dots" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <span
              className="stacks-boot-wait-dot"
              key={dot}
              style={
                { "--stacks-boot-dot-delay": `${dot * 0.18}s` } as CSSProperties
              }
            >
              .
            </span>
          ))}
        </span>
      </p>
      <div aria-hidden>{notes ? <BootWaitNotes active={active} /> : null}</div>
    </>
  );
}
