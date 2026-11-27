/**
 * Haptics inside the iOS app. WKWebView has no Vibration API, so the app
 * registers a `chappyHaptic` message handler (`ios/Chappy/SiteBrowser.swift`)
 * that plays UIKit's feedback generators. Unlike Safari's switch trick, it
 * works outside a tap's own handler too.
 */
export type NativeHaptic =
  /** A step through a set: a scrub tick, a gesture starting. */
  | "selection"
  /** Something settled: arriving at a stop, a button pressed. */
  | "light"
  /** Something taken hold of: a pickup, search opened. */
  | "medium";

type HapticHandler = { postMessage(message: { kind: NativeHaptic }): void };

/** Plays `kind` in the app. False everywhere else, so callers fall back. */
export function nativeHaptic(kind: NativeHaptic): boolean {
  try {
    const handler = (
      globalThis as {
        webkit?: { messageHandlers?: { chappyHaptic?: HapticHandler } };
      }
    ).webkit?.messageHandlers?.chappyHaptic;
    if (!handler) return false;
    handler.postMessage({ kind });
    return true;
  } catch {
    return false;
  }
}
