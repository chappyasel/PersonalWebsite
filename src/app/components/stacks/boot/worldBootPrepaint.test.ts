// Equivalence between the two boot adapters.
//
// The pre-paint script cannot import the machine, so the only thing keeping
// the two from drifting is this: run the real generated script against a fake
// document, over the whole input matrix, and assert it lands on exactly the
// phase the machine's view asks for. No source file is read — the script under
// test is the generator's own output.
import { describe, expect, it } from "vitest";

import {
  type WorldPhase,
  initialWorldBootState,
  reduceWorldBoot,
  worldBootView,
} from "./worldBootMachine";
import { WORLD_BOOT_POLICY } from "./worldBootPolicy";
import { worldBootPrepaintScript } from "./worldBootPrepaint";

const P = WORLD_BOOT_POLICY;

type Env = {
  webgl: "webgl2" | "webgl" | null;
  cachedCapability: string | null;
  reducedMotion: boolean;
  saveData: boolean;
  /** Raw localStorage contents for the warm record. */
  warmRecord: string | null;
  now: number;
  search: string;
  /** Attribute already on <html> when the script runs. */
  existingPhase: WorldPhase | null;
  storageThrows: boolean;
};

const BASE: Env = {
  webgl: "webgl2",
  cachedCapability: null,
  reducedMotion: false,
  saveData: false,
  warmRecord: null,
  now: 1_000_000,
  search: "",
  existingPhase: null,
  storageThrows: false,
};

type Timer = { fn: () => void; delayMs: number };

type Outcome = {
  phase: string | null;
  ogCapture: boolean;
  capabilityWritten: string | null;
  timer: Timer | null;
  fireTimer: () => string | null;
  priorTimerCleared: boolean;
};

function fakeStorage(seed: Record<string, string>, throws: boolean) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    api: {
      getItem(key: string) {
        if (throws) throw new Error("storage disabled");
        return map.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (throws) throw new Error("storage disabled");
        map.set(key, value);
      },
    },
  };
}

/** Execute the real generated script with every global it touches shadowed by
 * a fake, so nothing here needs a DOM implementation. */
function runPrepaint(overrides: Partial<Env> = {}): Outcome {
  const env = { ...BASE, ...overrides };
  const attributes = new Map<string, string>();
  if (env.existingPhase) attributes.set(P.worldAttribute, env.existingPhase);

  const el = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => void attributes.delete(name),
  };

  const session = fakeStorage(
    env.cachedCapability === null
      ? {}
      : { [P.webglCapabilityKey]: env.cachedCapability },
    env.storageThrows,
  );
  const local = fakeStorage(
    env.warmRecord === null ? {} : { [P.warmKey]: env.warmRecord },
    env.storageThrows,
  );

  const document = {
    documentElement: el,
    createElement: () => ({
      getContext: (kind: string) => (kind === env.webgl ? {} : null),
    }),
  };

  let scheduled: Timer | null = null;
  let nextTimerId = 1;
  let priorTimerCleared = false;
  const win: Record<string, unknown> = {
    // A previous boot on this document left a live timer behind, exactly as a
    // client-side navigation back to the homepage would.
    [P.prepaintTimerGlobal]: 7,
    [P.prepaintTokenGlobal]: 3,
  };

  const body = worldBootPrepaintScript(P);
  // The point of this test is that the SHIPPED script runs, not a transcription
  // of it. Compiling the generator's own output is the only way to prove the
  // pre-paint path and the machine agree.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(
    "window",
    "document",
    "location",
    "sessionStorage",
    "localStorage",
    "matchMedia",
    "navigator",
    "setTimeout",
    "clearTimeout",
    "Date",
    body,
  ) as (...args: unknown[]) => void;

  run(
    win,
    document,
    { search: env.search },
    session.api,
    local.api,
    (query: string) => ({
      matches: query === P.reducedMotionQuery && env.reducedMotion,
    }),
    { connection: env.saveData ? { saveData: true } : undefined },
    (fn: () => void, delayMs: number) => {
      scheduled = { fn, delayMs };
      return nextTimerId++;
    },
    (id: number) => {
      if (id === 7) priorTimerCleared = true;
    },
    { now: () => env.now },
  );

  return {
    phase: el.getAttribute(P.worldAttribute),
    ogCapture: el.getAttribute(P.ogCaptureAttribute) !== null,
    capabilityWritten: session.map.get(P.webglCapabilityKey) ?? null,
    timer: scheduled,
    priorTimerCleared,
    fireTimer: () => {
      scheduled?.fn();
      return el.getAttribute(P.worldAttribute);
    },
  };
}

/** What the machine says the handshake should be for the same inputs. */
function machinePhase(env: Partial<Env> = {}) {
  const merged = { ...BASE, ...env };
  let record: { t?: number } | null = null;
  try {
    record = JSON.parse(merged.warmRecord ?? "null") as { t?: number } | null;
  } catch {
    record = null;
  }
  const state = reduceWorldBoot(
    initialWorldBootState(),
    {
      type: "start",
      at: 0,
      origin: "prepaint",
      webglAvailable:
        (merged.cachedCapability ?? (merged.webgl !== null ? "1" : "0")) ===
        "1",
      prefersReducedMotion: merged.reducedMotion,
      saveData: merged.saveData,
      ogCapture: new URLSearchParams(merged.search).has(P.ogCaptureParam),
      warm: {
        source: "warmRecord",
        ageMs: record ? merged.now - (record.t ?? NaN) : null,
      },
    },
    P,
  );
  return { state, view: worldBootView(state) };
}

const MATRIX: [string, Partial<Env>][] = [
  ["a plain cold visit", {}],
  ["a fresh warm record", { warmRecord: JSON.stringify({ t: 999_000 }) }],
  [
    "a warm record one millisecond inside the window",
    { warmRecord: JSON.stringify({ t: 1_000_000 - (P.warmTtlMs - 1) }) },
  ],
  [
    "a warm record exactly at the window",
    { warmRecord: JSON.stringify({ t: 1_000_000 - P.warmTtlMs }) },
  ],
  [
    "a warm record from the future",
    { warmRecord: JSON.stringify({ t: 1_000_500 }) },
  ],
  ["a corrupt warm record", { warmRecord: "{not json" }],
  ["a warm record with no timestamp", { warmRecord: "{}" }],
  ["reduced motion", { reducedMotion: true }],
  [
    "reduced motion with a warm record",
    { reducedMotion: true, warmRecord: JSON.stringify({ t: 999_000 }) },
  ],
  ["Save-Data", { saveData: true }],
  [
    "Save-Data with a warm record",
    { saveData: true, warmRecord: JSON.stringify({ t: 999_000 }) },
  ],
  ["no WebGL at all", { webgl: null }],
  ["WebGL 1 only", { webgl: "webgl" }],
  ["a cached negative capability", { cachedCapability: "0" }],
  [
    "a cached positive capability on a broken canvas",
    {
      cachedCapability: "1",
      webgl: null,
    },
  ],
  ["an OG capture", { search: "?og-capture" }],
  [
    "an OG capture on an ineligible browser",
    { search: "?og-capture", webgl: null },
  ],
  [
    "a client-side return with the attribute still set",
    { existingPhase: "ready" },
  ],
];

describe("pre-paint adapter", () => {
  it.each(MATRIX)("agrees with the machine on %s", (_label, env) => {
    const script = runPrepaint(env);
    const { view } = machinePhase(env);
    expect(script.phase).toBe(view.documentPhase);
    expect(script.ogCapture).toBe(view.ogCapture);
  });

  it.each(MATRIX)(
    "arms the same backstop as the machine on %s",
    (_label, env) => {
      const script = runPrepaint(env);
      const { state } = machinePhase(env);
      if (state.deadline === null) {
        expect(script.timer).toBe(null);
        return;
      }
      expect(state.deadline.kind).toBe("prepaintBackstop");
      expect(script.timer?.delayMs).toBe(state.deadline.at);
      expect(script.timer?.delayMs).toBe(P.prepaintBackstopMs);
    },
  );

  it("fails open to the document when the backstop comes due", () => {
    const script = runPrepaint();
    expect(script.phase).toBe("pending");
    expect(script.fireTimer()).toBe(null);

    const { state } = machinePhase();
    const timedOut = reduceWorldBoot(
      state,
      { type: "tick", at: P.prepaintBackstopMs },
      P,
    );
    expect(worldBootView(timedOut).documentPhase).toBe(null);
    expect(timedOut.failure).toBe("hang");
  });

  it("leaves a revealed world alone when a stale backstop fires", () => {
    // The token guard is the real protection, but the phase check is what
    // stops an already-handed-off world from being yanked back to the flat
    // document mid-visit.
    const script = runPrepaint();
    const revealed = runPrepaint({ existingPhase: "ready" });
    expect(script.timer).not.toBe(null);
    expect(revealed.phase).toBe("pending");
    expect(revealed.fireTimer()).toBe(null);
  });

  it("retires a previous boot's backstop before arming its own", () => {
    expect(runPrepaint().priorTimerCleared).toBe(true);
    expect(runPrepaint({ webgl: null }).priorTimerCleared).toBe(true);
  });

  it("caches the capability probe once per tab and reuses the cached answer", () => {
    expect(runPrepaint({ webgl: "webgl2" }).capabilityWritten).toBe("1");
    expect(runPrepaint({ webgl: "webgl" }).capabilityWritten).toBe("1");
    expect(runPrepaint({ webgl: null }).capabilityWritten).toBe("0");
    // A cached answer is never re-probed, so a canvas that has since started
    // failing cannot flip the decision mid-session.
    expect(runPrepaint({ cachedCapability: "1", webgl: null }).phase).toBe(
      "pending",
    );
  });

  it("never caches the two live visitor choices", () => {
    const script = worldBootPrepaintScript(P);
    // Motion and Save-Data are read from the browser on every document load;
    // only the capability answer goes through storage.
    expect(script.indexOf("sessionStorage")).toBeGreaterThan(-1);
    expect(script).not.toContain('setItem("stacks-motion');
    expect(
      runPrepaint({ reducedMotion: true, cachedCapability: "1" }).phase,
    ).toBe(null);
    expect(runPrepaint({ saveData: true, cachedCapability: "1" }).phase).toBe(
      null,
    );
  });

  it("lands on the plain document when storage is blocked outright", () => {
    // Private mode with storage disabled throws on the first getItem, before
    // the phase is ever set. The visitor gets the document, not a page stuck
    // behind a boot screen.
    const script = runPrepaint({ storageThrows: true });
    expect(script.phase).toBe(null);
    expect(script.timer).toBe(null);
  });

  it("carries every policy constant instead of restating it", () => {
    const script = worldBootPrepaintScript({
      ...P,
      worldAttribute: "data-test-world",
      warmKey: "test-warm",
      webglCapabilityKey: "test-webgl",
      prepaintBackstopMs: 1234,
      warmTtlMs: 5678,
      ogCaptureParam: "test-capture",
      ogCaptureAttribute: "data-test-capture",
    });
    for (const literal of [
      "data-test-world",
      "test-warm",
      "test-webgl",
      "1234",
      "5678",
      "test-capture",
      "data-test-capture",
    ]) {
      expect(script).toContain(literal);
    }
    expect(script).not.toContain("data-world");
    expect(script).not.toContain(String(P.prepaintBackstopMs));
    expect(script).not.toContain(String(P.warmTtlMs));
  });
});
