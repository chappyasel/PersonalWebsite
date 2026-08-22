// The browser adapter for the boot machine: one live instance, every side
// effect the machine deliberately does not have, and nothing else.
//
// One instance, module-scoped, because the signals arrive from two different
// bundles. The boot vignette ships in the initial entry; the renderer, the
// loading manager, and the meadow ship in the lazy WebGL chunk. A React
// context could not span that, and threading a handle through would mean the
// scene knowing about the homepage.
//
// Deliberately dependency-free apart from the machine, the policy, and the
// progress observable, for the same reason loading.ts is: the boot vignette
// imports it, the vignette ships in the initial entry, and anything reachable
// from here ships there too.
import { setLoadProgress } from "../loading";

import {
  type WorldBootEvent,
  type WorldBootState,
  type WorldBootView,
  type WorldPhase,
  initialWorldBootState,
  reduceWorldBoot,
  worldBootView,
} from "./worldBootMachine";
import { WORLD_BOOT_POLICY } from "./worldBootPolicy";

/** Every event minus its timestamp, which the session stamps itself. */
type Distribute<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type WorldBootSignal = Distribute<WorldBootEvent, "at">;

/** The pre-paint script parks its backstop timer on these. */
type BootWindow = Record<string, number | undefined>;

function readWorldPhaseAttribute(): WorldPhase | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute(
    WORLD_BOOT_POLICY.worldAttribute,
  );
  return value === "pending" || value === "warm" || value === "ready"
    ? value
    : null;
}

/** The document handshake, read back. Used by anything that ships in the
 * initial entry and may be running before this session has started — the boot
 * vignette above all. */
export function documentWorldPhase(): WorldPhase | null {
  return readWorldPhaseAttribute();
}

/** Has the boot-to-world handoff finished? Adaptive quality uses this to
 * refuse to grade a device by the seconds when it was still parsing models
 * and compiling shaders. */
export function isWorldRevealed(): boolean {
  return readWorldPhaseAttribute() === "ready";
}

function probeWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Cached per tab: the answer to "can this browser run it" cannot change
 * mid-session, and creating a throwaway context costs about a millisecond. */
function webglAvailable(): boolean {
  try {
    const cached = window.sessionStorage.getItem(
      WORLD_BOOT_POLICY.webglCapabilityKey,
    );
    if (cached !== null) return cached === "1";
    const available = probeWebGLSupport();
    window.sessionStorage.setItem(
      WORLD_BOOT_POLICY.webglCapabilityKey,
      available ? "1" : "0",
    );
    return available;
  } catch {
    // Storage blocked. Probe directly rather than demoting a capable browser.
    return probeWebGLSupport();
  }
}

/** Records that the world reached the screen here, so the next load can pick
 * the shorter cached-world transition. */
function rememberWarmBoot(): void {
  try {
    localStorage.setItem(
      WORLD_BOOT_POLICY.warmKey,
      JSON.stringify({ t: Date.now() }),
    );
  } catch {
    // Private mode, quota, storage disabled. Every load is cold; that's fine.
  }
}

/** React owns failure recovery from the moment it exists, so the parse-time
 * timer must not survive this boot and later clear a newer visit's
 * attribute. */
export function retirePrepaintBackstop(): void {
  const win = window as unknown as BootWindow;
  const timer = win[WORLD_BOOT_POLICY.prepaintTimerGlobal];
  if (timer) {
    window.clearTimeout(timer);
    win[WORLD_BOOT_POLICY.prepaintTimerGlobal] = 0;
  }
  win[WORLD_BOOT_POLICY.prepaintTokenGlobal] =
    (win[WORLD_BOOT_POLICY.prepaintTokenGlobal] ?? 0) + 1;
}

function applyDocument(view: WorldBootView): void {
  if (typeof document === "undefined" || !view.ownsDocument) return;
  const root = document.documentElement;
  if (view.documentPhase === null) {
    root.removeAttribute(WORLD_BOOT_POLICY.worldAttribute);
  } else {
    root.setAttribute(WORLD_BOOT_POLICY.worldAttribute, view.documentPhase);
  }
  root.toggleAttribute(WORLD_BOOT_POLICY.ogCaptureAttribute, view.ogCapture);
}

const UNSTARTED_STATE = initialWorldBootState();

/** The view a server render projects: the flat document, with nobody yet
 * owning the handshake. One shared object, so the first client render hands
 * useSyncExternalStore the identical snapshot it hydrated against. */
export const SERVER_WORLD_BOOT_VIEW: WorldBootView =
  worldBootView(UNSTARTED_STATE);

class WorldBootSession {
  private state = UNSTARTED_STATE;
  private snapshot = SERVER_WORLD_BOOT_VIEW;
  private listeners = new Set<() => void>();

  /** Publish one signal. Returns the resulting view so a caller that needs
   * the answer now does not have to subscribe for it. */
  send(signal: WorldBootSignal, at = nowMs()): WorldBootView {
    const next = reduceWorldBoot(this.state, {
      ...signal,
      at,
    } as WorldBootEvent);
    if (next === this.state) return this.snapshot;
    const wasRevealed = this.snapshot.revealed;
    this.state = next;
    this.snapshot = worldBootView(next);
    applyDocument(this.snapshot);
    if (!wasRevealed && this.snapshot.revealed) {
      rememberWarmBoot();
      // The published number is presentation state only from here on;
      // readiness came from the live loading manager.
      setLoadProgress(1);
    }
    for (const listener of this.listeners) listener();
    return this.snapshot;
  }

  /** Probe the live browser and begin a boot. Every signal the decision rests
   * on is read here and passed to the machine as data. */
  start(origin: "prepaint" | "hydrate"): WorldBootView {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    return this.send({
      type: "start",
      origin,
      webglAvailable: webglAvailable(),
      prefersReducedMotion: window.matchMedia(
        WORLD_BOOT_POLICY.reducedMotionQuery,
      ).matches,
      saveData: Boolean(connection?.saveData),
      ogCapture: new URLSearchParams(window.location.search).has(
        WORLD_BOOT_POLICY.ogCaptureParam,
      ),
      // Not the stored record: the pre-paint script owns that decision and its
      // own backstop can revoke it, so by hydration the attribute is the more
      // truthful answer to "is this load warm".
      warm: { source: "documentPhase", phase: readWorldPhaseAttribute() },
    });
  }

  getView(): WorldBootView {
    return this.snapshot;
  }

  getState(): WorldBootState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export const worldBoot = new WorldBootSession();
