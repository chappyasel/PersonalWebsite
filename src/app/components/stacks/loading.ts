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

/** The document-level handshake the pre-paint boot script starts. `pending`
 * hides the flat page and shows the boot screen; `ready` retires both. The
 * attribute lives on <html> so CSS can act on it during the very first paint,
 * before React exists — see the script in page.tsx. */
export function setWorldPhase(phase: "pending" | "ready" | null): void {
  const root = document.documentElement;
  if (phase === null) delete root.dataset.world;
  else root.dataset.world = phase;
}
