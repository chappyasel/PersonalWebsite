// Equivalence between the two boot adapters.
//
// The pre-paint script cannot import the machine, so the only thing keeping
// the two from drifting is this: run the real generated script against a fake
// document, over the whole input matrix, and assert it lands on exactly the
// phase the machine's view asks for. No source file is read — the script under
// test is the generator's own output.
//
// The harness keeps ONE window, document, and pair of storages across repeated
// runs, because that is what a client-side navigation back to the homepage
// looks like: the same globals, a bumped token, and the previous run's timer
// still queued.
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
  storageThrows: false,
};

type Timer = { fn: () => void; delayMs: number; id: number };
type PrepaintOutcome = { token: number; timedOut: boolean };

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

/** One document load's worth of globals, reusable across repeated script runs
 * so stale-timer behaviour can actually be observed. */
function harness(overrides: Partial<Env> = {}) {
  const env = { ...BASE, ...overrides };
  const attributes = new Map<string, string>();
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

  const timers: Timer[] = [];
  const cleared: number[] = [];
  let nextTimerId = 1;
  const win: Record<string, unknown> = {};

  const body = worldBootPrepaintScript(P);
  // The point of this test is that the SHIPPED script runs, not a
  // transcription of it. Compiling the generator's own output is the only way
  // to prove the pre-paint path and the machine agree.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const compiled = new Function(
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

  const api = {
    env,
    win,
    timers,
    cleared,
    capabilityWritten: () => session.map.get(P.webglCapabilityKey) ?? null,
    phase: () => el.getAttribute(P.worldAttribute),
    ogCapture: () => el.getAttribute(P.ogCaptureAttribute) !== null,
    outcome: () => win[P.prepaintOutcomeGlobal] as PrepaintOutcome | undefined,
    token: () => win[P.prepaintTokenGlobal] as number | undefined,
    setPhase: (phase: WorldPhase) => attributes.set(P.worldAttribute, phase),
    /** Bump the token the way `retirePrepaintBackstop` does at hydration. */
    retire: () => {
      win[P.prepaintTokenGlobal] =
        ((win[P.prepaintTokenGlobal] as number) ?? 0) + 1;
    },
    fire: (index = timers.length - 1) => timers[index]?.fn(),
    run: () => {
      compiled(
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
          const id = nextTimerId++;
          timers.push({ fn, delayMs, id });
          return id;
        },
        (id: number) => cleared.push(id),
        { now: () => env.now },
      );
      return api;
    },
  };
  return api;
}

/** What the machine says the handshake should be for the same inputs. */
function machineFor(env: Partial<Env> = {}) {
  const merged = { ...BASE, ...env };
  let record: { t?: number } | null = null;
  try {
    record = JSON.parse(merged.warmRecord ?? "null") as { t?: number } | null;
  } catch {
    record = null;
  }
  // Storage denial is not a capability answer. Both adapters fall back to
  // probing the canvas and skip the cache entirely.
  const webglAvailable = merged.storageThrows
    ? merged.webgl !== null
    : (merged.cachedCapability ?? (merged.webgl !== null ? "1" : "0")) === "1";
  const state = reduceWorldBoot(
    initialWorldBootState(),
    {
      type: "start",
      at: 0,
      origin: "prepaint",
      prepaintTimedOut: false,
      webglAvailable,
      prefersReducedMotion: merged.reducedMotion,
      saveData: merged.saveData,
      ogCapture: new URLSearchParams(merged.search).has(P.ogCaptureParam),
      warm: {
        source: "warmRecord",
        ageMs:
          record && !merged.storageThrows
            ? merged.now - (record.t ?? NaN)
            : null,
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
    { cachedCapability: "1", webgl: null },
  ],
  ["an OG capture", { search: "?og-capture" }],
  [
    "an OG capture on an ineligible browser",
    { search: "?og-capture", webgl: null },
  ],
  ["storage denied on a capable browser", { storageThrows: true }],
  [
    "storage denied on a browser with no WebGL",
    { storageThrows: true, webgl: null },
  ],
  [
    "storage denied with reduced motion",
    { storageThrows: true, reducedMotion: true },
  ],
];

describe("pre-paint adapter", () => {
  it.each(MATRIX)("agrees with the machine on %s", (_label, env) => {
    const script = harness(env).run();
    const { view } = machineFor(env);
    expect(script.phase()).toBe(view.documentPhase);
    expect(script.ogCapture()).toBe(view.ogCapture);
  });

  it.each(MATRIX)(
    "arms the same backstop as the machine on %s",
    (_label, env) => {
      const script = harness(env).run();
      const { state } = machineFor(env);
      if (state.deadline === null) {
        expect(script.timers).toHaveLength(0);
        return;
      }
      expect(state.deadline.kind).toBe("prepaintBackstop");
      expect(script.timers[0]?.delayMs).toBe(state.deadline.at);
      expect(script.timers[0]?.delayMs).toBe(P.prepaintBackstopMs);
    },
  );

  it("runs the world for a capable browser that refuses storage", () => {
    // Hydration probes the canvas directly when sessionStorage throws. The
    // script used to let that throw reach its outer catch, hand the visitor
    // the document, and then contradict itself a second later.
    const script = harness({ storageThrows: true }).run();
    expect(script.phase()).toBe("pending");
    expect(script.timers).toHaveLength(1);
    expect(script.capabilityWritten()).toBe(null);
  });
});

describe("the fail-open backstop", () => {
  it("hands the document back and records why", () => {
    const script = harness().run();
    expect(script.phase()).toBe("pending");
    script.fire();
    expect(script.phase()).toBe(null);
    expect(script.outcome()).toEqual({ token: script.token(), timedOut: true });

    const { state } = machineFor();
    const timedOut = reduceWorldBoot(
      state,
      { type: "tick", at: P.prepaintBackstopMs },
      P,
    );
    expect(worldBootView(timedOut).documentPhase).toBe(null);
    expect(timedOut.failure).toBe("hang");
  });

  it("leaves a revealed world alone and records nothing", () => {
    // Same window, same timer: the world got there between scheduling and the
    // backstop coming due. Retiring it now would yank the room out from under
    // a visitor who is already reading it.
    const script = harness().run();
    script.setPhase("ready");
    script.fire();
    expect(script.phase()).toBe("ready");
    expect(script.outcome()).toBeUndefined();
  });

  it("no-ops when a newer token has claimed the document", () => {
    // Same window, run twice: the second run bumps the token, so the first
    // run's timer must not touch the second run's handshake.
    const script = harness().run();
    const staleTimer = script.timers.length - 1;
    script.run();
    expect(script.timers).toHaveLength(2);
    expect(script.phase()).toBe("pending");

    script.fire(staleTimer);
    expect(script.phase()).toBe("pending");
    expect(script.outcome()).toBeUndefined();

    // The live timer still works.
    script.fire();
    expect(script.phase()).toBe(null);
    expect(script.outcome()?.timedOut).toBe(true);
  });

  it("no-ops after hydration has retired it", () => {
    const script = harness().run();
    script.retire();
    script.fire();
    expect(script.phase()).toBe("pending");
    expect(script.outcome()).toBeUndefined();
  });

  it("clears the previous run's timer before arming its own", () => {
    const script = harness().run();
    const firstId = script.timers[0]?.id;
    script.run();
    expect(script.cleared).toContain(firstId);
  });

  it("clears a previous timer even when this load is not eligible", () => {
    const ineligible = harness({ reducedMotion: true });
    ineligible.win[P.prepaintTimerGlobal] = 41;
    ineligible.run();
    expect(ineligible.cleared).toContain(41);
  });
});

describe("the capability cache", () => {
  it("probes once per tab and reuses the cached answer", () => {
    expect(harness({ webgl: "webgl2" }).run().capabilityWritten()).toBe("1");
    expect(harness({ webgl: "webgl" }).run().capabilityWritten()).toBe("1");
    expect(harness({ webgl: null }).run().capabilityWritten()).toBe("0");
    // A cached answer is never re-probed, so a canvas that has since started
    // failing cannot flip the decision mid-session.
    expect(harness({ cachedCapability: "1", webgl: null }).run().phase()).toBe(
      "pending",
    );
  });

  it("never caches the two live visitor choices", () => {
    expect(
      harness({ reducedMotion: true, cachedCapability: "1" }).run().phase(),
    ).toBe(null);
    expect(
      harness({ saveData: true, cachedCapability: "1" }).run().phase(),
    ).toBe(null);
  });
});

describe("generated constants", () => {
  it("carries every policy value instead of restating it", () => {
    const script = worldBootPrepaintScript({
      ...P,
      worldAttribute: "data-test-world",
      warmKey: "test-warm",
      webglCapabilityKey: "test-webgl",
      prepaintBackstopMs: 1234,
      warmTtlMs: 5678,
      ogCaptureParam: "test-capture",
      ogCaptureAttribute: "data-test-capture",
      prepaintOutcomeGlobal: "__testOutcome",
      prepaintStartedAtGlobal: "__testStartedAt",
    });
    for (const literal of [
      "data-test-world",
      "test-warm",
      "test-webgl",
      "1234",
      "5678",
      "test-capture",
      "data-test-capture",
      "__testOutcome",
      "__testStartedAt",
    ]) {
      expect(script).toContain(literal);
    }
    expect(script).not.toContain("data-world");
    expect(script).not.toContain(String(P.prepaintBackstopMs));
    expect(script).not.toContain(String(P.warmTtlMs));
    expect(script).not.toContain(P.prepaintOutcomeGlobal);
    expect(script).not.toContain(P.prepaintStartedAtGlobal);
  });
});
