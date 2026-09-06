"use client";

// The React adapter: four effects that do nothing but carry signals in and
// time forward. No policy lives here.
import { useEffect, useState, useSyncExternalStore } from "react";

import { type WorldBootView } from "./worldBootMachine";
import { WORLD_BOOT_POLICY } from "./worldBootPolicy";
import {
  SERVER_WORLD_BOOT_VIEW,
  type WorldBootScope,
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
    const scope = worldBoot.start("hydrate");
    // React owns failure recovery from here: the error boundary and the hang
    // backstop replace the parse-time timer.
    retirePrepaintBackstop();
    return () => {
      retirePrepaintBackstop();
      // Stamped with the generation this effect opened. A cleanup that lands
      // after a newer boot has begun is describing a page that is already
      // gone, and must not take the live one down with it.
      scope.send({ type: "exit" });
    };
  }, []);

  // Tab visibility, published once at mount and on every change. The machine
  // freezes its deadlines while the document is hidden; without this a tab
  // backgrounded during a boot comes back demoted, because the reveal gate is
  // sampled on requestAnimationFrame (frozen) while the backstop below is a
  // setTimeout (throttled, but still fires).
  useEffect(() => {
    const publish = () =>
      worldBoot.send({ type: "visibility", hidden: document.hidden });
    publish();
    document.addEventListener("visibilitychange", publish);
    return () => document.removeEventListener("visibilitychange", publish);
  }, []);

  // A lost WebGL context is the one failure worth a second try. macOS drops
  // a window's context while it is parked on another desktop, and the visitor
  // came back to the flat page with no way up but a reload. Once the tab is
  // visible again, boot afresh; how many times is the machine's policy.
  const { recoverable } = view;
  useEffect(() => {
    if (!recoverable) return;
    let timer: number | null = null;
    const attempt = () => {
      if (document.hidden || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        worldBoot.start("hydrate");
      }, WORLD_BOOT_POLICY.contextLossRestartDelayMs);
    };
    attempt();
    document.addEventListener("visibilitychange", attempt);
    return () => {
      document.removeEventListener("visibilitychange", attempt);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [recoverable]);

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

/** A sender bound to the boot generation live when this component first
 * rendered. Everything that reports readiness or failure from inside a
 * mounted world holds one, so a signal that arrives after a route change
 * cannot be mistaken for the next boot's. */
export function useWorldBootScope(): WorldBootScope {
  const [scope] = useState(() => worldBoot.scope());
  return scope;
}
