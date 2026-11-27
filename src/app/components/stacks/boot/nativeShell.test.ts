import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

import { isNativeShell, nativeShellAnnounceScript } from "./nativeShell";

const APP_AGENT = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ChappyApp/1";
const SAFARI_AGENT =
  "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/605.1.15";

/** Runs the inline script against just the globals it reads. */
function runInline(userAgent: string, webkit?: unknown) {
  runInNewContext(nativeShellAnnounceScript, {
    navigator: { userAgent },
    window: { webkit },
  });
}

function handler() {
  const postMessage = vi.fn();
  return {
    postMessage,
    webkit: { messageHandlers: { chappyRoom: { postMessage } } },
  };
}

describe("native shell", () => {
  it("recognises the app's user agent only", () => {
    expect(isNativeShell(APP_AGENT)).toBe(true);
    expect(isNativeShell(SAFARI_AGENT)).toBe(false);
  });

  it("announces a room page to the app during parse", () => {
    const app = handler();
    runInline(APP_AGENT, app.webkit);
    expect(app.postMessage).toHaveBeenCalledWith({
      boot: "starting",
      epoch: 0,
    });
    const safari = handler();
    runInline(SAFARI_AGENT, safari.webkit);
    expect(safari.postMessage).not.toHaveBeenCalled();
  });

  it("never throws without the app's handler", () => {
    expect(() => runInline(APP_AGENT)).not.toThrow();
    expect(() => runInline(APP_AGENT, { messageHandlers: {} })).not.toThrow();
  });
});
