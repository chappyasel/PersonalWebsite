// The iOS app (`ios/`) shows the homepage in a WKWebView that adds
// `ChappyApp/<n>` to its user agent. The app holds a native cover over the web
// view until the room tells it the boot has settled, through the `chappyRoom`
// script message handler (`ios/Chappy/SiteWebView.swift`).

const NATIVE_SHELL_AGENT = /\bChappyApp\/\d+/;

export function isNativeShell(userAgent: string): boolean {
  return NATIVE_SHELL_AGENT.test(userAgent);
}

/** `starting` comes from the page's inline script, so the app knows this page
 * will report and keeps its cover up past the load event. The boot then sends
 * `live` with the room on screen, or `fallback` for a page the visitor can
 * read without it (no WebGL, a held drawing, a failed boot). */
export type NativeShellBoot = "starting" | "live" | "fallback";

/** Inline, during parse. A page without it, or a site from before it, gets its
 * cover lifted when it finishes loading. */
export const nativeShellAnnounceScript = `try{if(${NATIVE_SHELL_AGENT}.test(navigator.userAgent))window.webkit.messageHandlers.chappyRoom.postMessage({boot:"starting",epoch:0})}catch(e){}`;

type MessageHandlers = {
  chappyRoom?: { postMessage(message: unknown): void };
};

export function tellNativeShell(boot: NativeShellBoot, epoch: number): void {
  const handlers = (
    window as Window & { webkit?: { messageHandlers?: MessageHandlers } }
  ).webkit?.messageHandlers;
  try {
    handlers?.chappyRoom?.postMessage({ boot, epoch });
  } catch {
    // The app lifts its cover on a timer when no message arrives.
  }
}
