// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WORLD_BOOT_POLICY as P } from "./worldBootPolicy";
import { WorldBootSession, retirePrepaintBackstop } from "./worldBootSession";

let webgl = true;
let reducedMotion = false;
let saveData = false;
let session: WorldBootSession;
let contextProbe = vi.fn();
const KEY = "projects:light:desktop:1";
const globals = () => window as unknown as Record<string, unknown>;

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

beforeEach(() => {
  webgl = true;
  reducedMotion = false;
  saveData = false;
  session = new WorldBootSession();
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  window.history.replaceState(null, "", "/");
  for (const attr of [
    P.worldAttribute,
    P.illustrationAttribute,
    P.presentationAttribute,
    P.ogCaptureAttribute,
  ])
    document.documentElement.removeAttribute(attr);
  for (const key of [
    P.prepaintTokenGlobal,
    P.prepaintOutcomeGlobal,
    P.prepaintTimerGlobal,
    P.prepaintStartedAtGlobal,
  ])
    delete globals()[key];
  vi.spyOn(performance, "now").mockReturnValue(0);
  contextProbe = vi.fn(() => (webgl ? ({} as never) : null));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    contextProbe,
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reducedMotion })),
  );
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    get: () => ({ saveData }),
  });
  session.setDocumentActive(true);
});
afterEach(() => {
  session.setDocumentActive(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function optIn() {
  document.documentElement.setAttribute(P.illustrationAttribute, "enabled");
}
function ready() {
  const scope = session.scope();
  scope.send(
    {
      type: "assetLoad",
      assets: { active: false, loaded: 1, total: 1, errors: 0 },
    },
    10,
  );
  scope.send({ type: "firstFrame" }, 10);
  scope.send({ type: "meadowReady" }, 10);
  session.send({ type: "tick" }, 260);
  return scope;
}
function promote() {
  session.send({ type: "illustrationChanged", key: KEY }, 0);
  const scope = ready();
  scope.send({ type: "illustrationRegistered", key: KEY }, 300);
  session.send({ type: "tick" }, 480);
  scope.send({ type: "illustrationTravelCompleted", key: KEY }, 880);
  return scope;
}

describe("illustrated browser adapter", () => {
  it("opts in only from the page marker and leaves OG on its legacy path", () => {
    session.start("hydrate");
    expect(session.getState().illustratedMode).toBe(false);
    expect(
      document.documentElement.getAttribute(P.presentationAttribute),
    ).toBeNull();
    optIn();
    session.start("hydrate");
    expect(session.getState().illustratedMode).toBe(true);
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      "illustrated",
    );
    window.history.replaceState(null, "", "/?og-capture");
    session.start("hydrate");
    expect(session.getState().illustratedMode).toBe(false);
    expect(
      document.documentElement.getAttribute(P.presentationAttribute),
    ).toBeNull();
  });

  it("publishes ready and warm evidence only after full camera arrival", () => {
    optIn();
    session.start("hydrate");
    session.send({ type: "illustrationChanged", key: KEY }, 0);
    const scope = ready();
    scope.send({ type: "illustrationRegistered", key: KEY }, 300);
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      "dissolve",
    );
    expect(document.documentElement.getAttribute(P.worldAttribute)).toBe(
      "pending",
    );
    expect(localStorage.getItem(P.warmKey)).toBeNull();
    session.send({ type: "tick" }, 480);
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      "travel",
    );
    expect(localStorage.getItem(P.warmKey)).toBeNull();
    scope.send({ type: "illustrationTravelCompleted", key: KEY }, 880);
    expect(document.documentElement.getAttribute(P.worldAttribute)).toBe(
      "ready",
    );
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      "live",
    );
    expect(localStorage.getItem(P.warmKey)).not.toBeNull();
  });

  it("parks presentation without discarding readiness and refuses a parked retry", () => {
    optIn();
    session.start("hydrate");
    promote();
    const epoch = session.getView().epoch;
    session.setDocumentActive(false);
    expect(document.documentElement.getAttribute(P.worldAttribute)).toBeNull();
    expect(
      document.documentElement.getAttribute(P.presentationAttribute),
    ).toBeNull();
    expect(session.getView().revealed).toBe(true);
    session.request3D();
    expect(session.getView().epoch).toBe(epoch);
    session.setDocumentActive(true);
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      "live",
    );
  });

  it("reprobes a cached unavailable renderer for a deliberate request", () => {
    optIn();
    sessionStorage.setItem(P.webglCapabilityKey, "0");
    session.start("hydrate");
    expect(session.getView().presentation).toBe("illustrated");
    expect(session.getView().worldMounted).toBe(false);
    expect(contextProbe).not.toHaveBeenCalled();
    session.request3D();
    expect(session.getView().worldMounted).toBe(true);
    expect(sessionStorage.getItem(P.webglCapabilityKey)).toBe("1");
  });

  it.each(["motion", "data"] as const)(
    "rechecks %s preference without bypassing it",
    (preference) => {
      optIn();
      session.start("hydrate");
      session.send({ type: "illustrationInteracted" });
      if (preference === "motion") reducedMotion = true;
      else saveData = true;
      session.request3D();
      expect(session.getView()).toMatchObject({
        presentation: "document",
        worldMounted: false,
        canRequest3D: false,
        ineligibility: preference === "motion" ? "reduced_motion" : "save_data",
      });
      reducedMotion = false;
      saveData = false;
      session.request3D();
      expect(session.getView()).toMatchObject({
        worldMounted: true,
        interactionHeld: false,
      });
    },
  );

  it("honors a held reader and stale scopes across explicit retry", () => {
    optIn();
    const old = session.start("hydrate");
    session.send({ type: "illustrationChanged", key: KEY });
    session.send({ type: "illustrationInteracted" });
    expect(session.getView().worldMounted).toBe(false);
    session.start("hydrate");
    expect(session.getView().worldMounted).toBe(false);
    const current = session.request3D();
    const before = session.getView();
    old.send({ type: "contextLost" });
    old.send({ type: "illustrationRegistered", key: KEY });
    expect(session.getView()).toBe(before);
    expect(current.epoch).toBe(before.epoch);
    expect(before).toMatchObject({
      worldMounted: true,
      interactionHeld: false,
      illustrationKey: KEY,
    });
  });

  it("limits explicit context-loss retries to the existing document budget", () => {
    optIn();
    let scope = session.start("hydrate");
    for (let attempt = 0; attempt < P.contextLossRecoveries; attempt++) {
      scope.send({ type: "contextLost" });
      expect(session.getView().canRequest3D).toBe(true);
      scope = session.request3D();
    }
    scope.send({ type: "contextLost" });
    const exhausted = session.getView();
    expect(exhausted).toMatchObject({
      canRequest3D: false,
      recoverable: false,
      presentation: "illustrated",
    });
    session.request3D();
    expect(session.getView()).toBe(exhausted);
  });

  it("retains document delivery after consuming the prepaint timeout once", () => {
    optIn();
    globals()[P.prepaintTokenGlobal] = 7;
    globals()[P.prepaintOutcomeGlobal] = { token: 7, timedOut: true };
    session.start("hydrate");
    retirePrepaintBackstop();
    expect(session.getView().presentation).toBe("document");
    session.start("hydrate");
    expect(session.getView().presentation).toBe("document");
    session.request3D();
    expect(session.getView().presentation).toBe("illustrated");
  });

  it("keeps motion diagnostics session-only and never rewrites preference policy", () => {
    optIn();
    session.setIllustrationMotionEnabled(false);
    session.start("hydrate");
    ready();
    expect(session.getView()).toMatchObject({
      presentation: "live",
      motionEnabled: false,
    });
    expect(sessionStorage.getItem(P.webglCapabilityKey)).toBe("1");
    expect(new WorldBootSession().getView().motionEnabled).toBe(true);
    expect(P.reducedMotionQuery).toBe("(prefers-reduced-motion: reduce)");
  });
});
