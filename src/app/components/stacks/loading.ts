// Load progress, published from inside the lazy WebGL chunk and read by the
// boot screen, which is NOT lazy.
//
// Deliberately dependency-free, and for the same reason `photoSources.ts` is:
// the boot screen ships in the initial entry, so anything it imports ships
// there too. Reaching for the scene's zustand store here would be harmless
// today and a regression the first time that store imports something from
// three — which is exactly how drei/r3f got dragged into the entry once
// before. A twenty-line observable costs nothing and cannot rot that way.
//
// `useSyncExternalStore` wants a stable snapshot, so `get` returns a number
// and never an object.

/** Fraction of the WebGL chunk + its assets that has arrived, 0…1. */
let progress = 0;
const listeners = new Set<() => void>();

export function setLoadProgress(next: number): void {
  const clamped = next < 0 ? 0 : next > 1 ? 1 : next;
  // Monotonic. three's DefaultLoadingManager recomputes loaded/total as new
  // requests are queued, so the raw ratio dips every time a prop that was
  // waiting on Suspense starts fetching — a bar that goes backwards reads as
  // a stall even when the download is healthy.
  if (clamped <= progress) return;
  progress = clamped;
  for (const listener of listeners) listener();
}

export function getLoadProgress(): number {
  return progress;
}

export function subscribeLoadProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Meadow readiness — a separate flag because the progress number above
// cannot carry it. The published progress is a monotonic high-water mark
// over drei's DefaultLoadingManager, the manager rebases between batches,
// and the meadow chunk's own JS fetch was invisible to it entirely — so
// "progress ≥ 0.85" can be true while the grass has not arrived, and the
// boot reveal used to race it (grass popping in after the curtain lifted).
// Meadow reports here the moment its instance buffers are filled; the mount
// site reports immediately when the meadow is disabled (?nomeadow, flag
// off) so the reveal gate never waits on something that will not come.

let meadowReady = false;

export function markMeadowReady(): void {
  meadowReady = true;
}

export function isMeadowReady(): boolean {
  return meadowReady;
}

/** The document-level handshake the pre-paint boot script starts. `pending`
 * hides the flat page and shows the boot screen; `warm` hides the flat page
 * but holds the boot screen back (see WARM_* below); `ready` retires both.
 * The attribute lives on <html> so CSS can act on it during the very first
 * paint, before React exists — see the script in page.tsx. */
export function setWorldPhase(phase: "pending" | "warm" | "ready" | null): void {
  const root = document.documentElement;
  if (phase === null) delete root.dataset.world;
  else root.dataset.world = phase;
}

/** Was this load predicted warm by the pre-paint script? Read the attribute
 * rather than localStorage again: the script owns the decision (it also
 * weighs reduced-motion and Save-Data), and its 20-second safety net can
 * revoke it. */
export function isWarmBoot(): boolean {
  return document.documentElement.dataset.world === "warm";
}

// ---------------------------------------------------------------------------
// The warm-boot record.
//
// A reload or a back-navigation is fast because the BROWSER CACHE already has
// the chunk and the assets — so the flag that predicts it has to live where
// that cache lives: the profile, not the tab. sessionStorage would miss the
// case he actually asked about (leaving for another page and coming back in a
// new tab), and would claim a cold second tab is warm.
//
// It is only ever a PREDICTION. Nothing here hides the loading screen
// outright; a wrong guess costs a few hundred milliseconds of quiet before
// the shelf comes up as usual (globals.css, `data-world="warm"`).

/** Key for the record: `{ t: last successful reveal (epoch ms), d: how long
 * that reveal took from navigation start } `. */
export const WARM_KEY = "stacks-warm";

/** How long a successful reveal is allowed to predict the next one. Long
 * enough to cover the visit-and-come-back-tomorrow case, short enough that an
 * evicted HTTP cache cannot keep claiming to be warm for weeks. */
export const WARM_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Headroom on the measured grace. The question the grace really asks is "is
 * this load going worse than the last one?", and a grace set to exactly the
 * last duration answers that with a coin toss — half of an unchanged load
 * would flash the loader for the last instant before the room arrives.
 * Thirty percent means it only comes up when the load is meaningfully
 * slower. */
export const WARM_GRACE_SLACK = 1.3;

/** Floor and ceiling on the measured grace. The floor keeps a suspiciously
 * fast measurement from making the grace meaningless; the ceiling is the
 * point past which an unexplained blank background stops reading as speed and
 * starts reading as breakage — about a second is where a quiet screen turns
 * into a broken one. */
export const WARM_GRACE_MIN_MS = 250;
export const WARM_GRACE_MAX_MS = 900;

/** Records that the world reached the screen here, and how long it took. The
 * duration is what the next load spends its grace period on: the honest
 * estimate of "still fine, keep waiting" is how long it took last time. */
export function rememberWarmBoot(revealMs: number): void {
  try {
    localStorage.setItem(
      WARM_KEY,
      JSON.stringify({ t: Date.now(), d: Math.round(revealMs) }),
    );
  } catch {
    // Private mode, quota, storage disabled. Every load is cold; that's fine.
  }
}
