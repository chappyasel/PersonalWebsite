"use client";

// The React adapter: three effects that do nothing but carry signals in and
// time forward. No policy lives here.
import { useEffect, useSyncExternalStore } from "react";

import { type WorldBootView } from "./worldBootMachine";
import {
  SERVER_WORLD_BOOT_VIEW,
  retirePrepaintBackstop,
  worldBoot,
} from "./worldBootSession";

const subscribe = (listener: () => void) => worldBoot.subscribe(listener);
const getSnapshot = () => worldBoot.getView();
const getServerSnapshot = () => SERVER_WORLD_BOOT_VIEW;

/** Boot the homepage world and report what the visitor should be looking at.
 *
 * The first client render deliberately matches the server: the flat document,
 * with the handshake unclaimed. The boot starts in an effect, one commit
 * later, so hydration never has to reconcile a world that was not there. */
export function useWorldBoot(): WorldBootView {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Agrees with the pre-paint script, and also covers the case where the
    // script never ran (a bfcache restore, an extension stripping inline
    // scripts) — the boot screen still comes up rather than the document.
    worldBoot.start("hydrate");
    // React owns failure recovery from here: the error boundary and the hang
    // backstop replace the parse-time timer.
    retirePrepaintBackstop();
    return () => {
      retirePrepaintBackstop();
      worldBoot.send({ type: "exit" });
    };
  }, []);

  // One timer for whichever deadline is armed: the hang backstop before the
  // reveal, the cross-fade after it.
  const { deadlineAt } = view;
  useEffect(() => {
    if (deadlineAt === null) return;
    const timer = window.setTimeout(
      () => worldBoot.send({ type: "tick" }),
      Math.max(0, deadlineAt - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [deadlineAt]);

  // The reveal gate closes on a quiet window rather than an event, so it has
  // to be sampled. Only once a frame has painted — nothing before that can
  // open it.
  const { awaitingReveal } = view;
  useEffect(() => {
    if (!awaitingReveal) return;
    let frame = requestAnimationFrame(function check() {
      worldBoot.send({ type: "tick" });
      frame = requestAnimationFrame(check);
    });
    return () => cancelAnimationFrame(frame);
  }, [awaitingReveal]);

  return view;
}
