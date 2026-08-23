import { describe, expect, it } from "vitest";

import {
  type AssetLoadState,
  type WarmEvidence,
  type WorldBootEvent,
  type WorldBootState,
  type WorldBootStatus,
  assetLoadComplete,
  initialWorldBootState,
  isBootingPhase,
  isWarmStart,
  reduceWorldBoot,
  worldBootView,
  worldEligible,
} from "./worldBootMachine";
import { WORLD_BOOT_POLICY } from "./worldBootPolicy";

const P = WORLD_BOOT_POLICY;

const COMPLETE: AssetLoadState = {
  active: false,
  loaded: 10,
  total: 10,
  errors: 0,
};
const LOADING: AssetLoadState = {
  active: true,
  loaded: 4,
  total: 10,
  errors: 0,
};

type StartOverrides = Partial<
  Omit<Extract<WorldBootEvent, { type: "start" }>, "type">
>;

function start(overrides: StartOverrides = {}): WorldBootEvent {
  return {
    type: "start",
    at: 0,
    origin: "hydrate",
    webglAvailable: true,
    prefersReducedMotion: false,
    saveData: false,
    ogCapture: false,
    holdBoot: false,
    prepaintTimedOut: false,
    warm: { source: "documentPhase", phase: null },
    ...overrides,
  };
}

/** Event builders stamped with one boot generation, the way a scoped sender
 * stamps a mounted producer's signals. Writing `gen(1)` and `gen(2)` side by
 * side is what makes the stale cases below readable. */
function gen(epoch: number) {
  return {
    firstFrame: (at: number): WorldBootEvent => ({
      type: "firstFrame",
      at,
      epoch,
    }),
    assets: (at: number, assets: AssetLoadState): WorldBootEvent => ({
      type: "assetLoad",
      at,
      epoch,
      assets,
    }),
    meadow: (at: number): WorldBootEvent => ({
      type: "meadowReady",
      at,
      epoch,
    }),
    meadowPending: (at: number): WorldBootEvent => ({
      type: "meadowPending",
      at,
      epoch,
    }),
    runtimeError: (at: number): WorldBootEvent => ({
      type: "runtimeError",
      at,
      epoch,
    }),
    contextLost: (at: number): WorldBootEvent => ({
      type: "contextLost",
      at,
      epoch,
    }),
    exit: (at: number): WorldBootEvent => ({ type: "exit", at, epoch }),
  };
}

const g1 = gen(1);
const g2 = gen(2);

const vignetteStarted = (at: number): WorldBootEvent => ({
  type: "bootVignetteStarted",
  at,
});
const vignetteDone = (at: number): WorldBootEvent => ({
  type: "bootVignetteCompleted",
  at,
});
const tick = (at: number): WorldBootEvent => ({ type: "tick", at });

/** Drive the machine with an explicit script of events. Every `at` is a fake
 * clock reading, so nothing here depends on real time passing. */
function run(events: WorldBootEvent[], from = initialWorldBootState()) {
  return events.reduce(
    (state, event) => reduceWorldBoot(state, event, P),
    from,
  );
}

function view(state: WorldBootState) {
  return worldBootView(state);
}

/** The shortest path from a cold start to a revealed world, under epoch 1. */
function bootedTo(status: "booting" | "revealing" | "live", t = 0) {
  const booting = run([start({ at: t })]);
  if (status === "booting") return booting;
  const revealing = run(
    [
      g1.firstFrame(t + 10),
      g1.assets(t + 10, COMPLETE),
      g1.meadow(t + 10),
      vignetteDone(t + 10),
      tick(t + 10 + P.assetSettleMs),
    ],
    booting,
  );
  if (status === "revealing") return revealing;
  return run([tick(t + 10 + P.assetSettleMs + P.flatRetireMs)], revealing);
}

describe("initial capability", () => {
  it("renders the flat document before any decision is made", () => {
    const v = view(initialWorldBootState());
    expect(v.status).toBe("unstarted");
    expect(v.epoch).toBe(0);
    expect(v.mode).toBe("flat");
    expect(v.worldMounted).toBe(false);
    expect(v.flatMounted).toBe(true);
    expect(v.flatAnimated).toBe(true);
    // Nothing has claimed the handshake, so no adapter may write the
    // attribute — this is exactly what the server rendered.
    expect(v.ownsDocument).toBe(false);
    expect(v.documentPhase).toBe(null);
  });

  it.each([
    ["no WebGL", { webglAvailable: false }, "webgl_unavailable"],
    ["reduced motion", { prefersReducedMotion: true }, "reduced_motion"],
    ["Save-Data", { saveData: true }, "save_data"],
    [
      "reduced motion and Save-Data together",
      { prefersReducedMotion: true, saveData: true },
      "reduced_motion",
    ],
  ] as const)(
    "keeps the document when the visitor has %s",
    (_label, overrides, reason) => {
      const v = view(run([start(overrides)]));
      expect(v.status).toBe("ineligible");
      expect(v.ineligibility).toBe(reason);
      expect(v.mode).toBe("flat");
      expect(v.documentPhase).toBe(null);
      expect(v.ownsDocument).toBe(true);
      expect(v.deadlineAt).toBe(null);
    },
  );

  it("mounts the world only when all three signals allow it", () => {
    for (const webglAvailable of [true, false])
      for (const prefersReducedMotion of [true, false])
        for (const saveData of [true, false]) {
          const eligible = worldEligible({
            webglAvailable,
            prefersReducedMotion,
            saveData,
          });
          expect(eligible).toBe(
            webglAvailable && !prefersReducedMotion && !saveData,
          );
          expect(
            view(
              run([start({ webglAvailable, prefersReducedMotion, saveData })]),
            ).status,
          ).toBe(eligible ? "booting" : "ineligible");
        }
  });

  it("shows the boot screen and keeps the flat content mounted while loading", () => {
    const v = view(bootedTo("booting"));
    expect(v.status).toBe("booting");
    expect(v.documentPhase).toBe("pending");
    expect(v.mode).toBe("world");
    expect(v.worldMounted).toBe(true);
    expect(v.revealed).toBe(false);
    expect(v.canvasReady).toBe(false);
    // Semantic flat content stays in the DOM the whole time. Crawlers and
    // assistive tech read it; CSS is what hides it from sighted visitors.
    expect(v.flatMounted).toBe(true);
    expect(v.flatAnimated).toBe(false);
  });

  it("carries the parse-time journey start without moving boot deadlines", () => {
    const state = run([start({ at: 500, journeyStartedAt: 100 })]);
    expect(state.startedAt).toBe(100);
    expect(state.deadline?.at).toBe(500 + P.hangBackstopMs);
  });

  it("opens a new generation on every start", () => {
    expect(view(run([start()])).epoch).toBe(1);
    expect(view(run([start({ at: 100 })], bootedTo("live"))).epoch).toBe(2);
    // Even a start that decides against the world consumes a generation, so
    // the previous world's producers cannot address it.
    expect(view(run([start({ saveData: true })])).epoch).toBe(1);
  });
});

describe("warm cache", () => {
  it.each<[string, WarmEvidence, boolean]>([
    ["a fresh record", { source: "warmRecord", ageMs: 1_000 }, true],
    ["a record from just now", { source: "warmRecord", ageMs: 0 }, true],
    [
      "a record one millisecond inside the window",
      { source: "warmRecord", ageMs: P.warmTtlMs - 1 },
      true,
    ],
    [
      "a record exactly at the window",
      { source: "warmRecord", ageMs: P.warmTtlMs },
      false,
    ],
    [
      "a record from the future (clock moved back)",
      { source: "warmRecord", ageMs: -5 },
      false,
    ],
    ["no record at all", { source: "warmRecord", ageMs: null }, false],
    [
      "a warm attribute left by the pre-paint script",
      { source: "documentPhase", phase: "warm" },
      true,
    ],
    [
      "a pending attribute",
      { source: "documentPhase", phase: "pending" },
      false,
    ],
    [
      "an attribute the pre-paint backstop already revoked",
      { source: "documentPhase", phase: null },
      false,
    ],
  ])("treats %s as warm=%s", (_label, warm, expected) => {
    expect(isWarmStart(warm, P)).toBe(expected);
    const v = view(run([start({ warm })]));
    expect(v.loadPath).toBe(expected ? "warm" : "cold");
    expect(v.documentPhase).toBe(expected ? "warm" : "pending");
  });

  it("never lets a warm prediction skip the boot screen", () => {
    const v = view(run([start({ warm: { source: "warmRecord", ageMs: 0 } })]));
    expect(v.revealed).toBe(false);
    expect(isBootingPhase(v.documentPhase)).toBe(true);
  });

  it("never lets a warm record override reduced motion or Save-Data", () => {
    const warm: WarmEvidence = { source: "warmRecord", ageMs: 0 };
    expect(
      view(run([start({ warm, prefersReducedMotion: true })])).status,
    ).toBe("ineligible");
    expect(view(run([start({ warm, saveData: true })])).status).toBe(
      "ineligible",
    );
  });
});

describe("held boot presentation", () => {
  it("keeps a fully loaded world behind the boot screen without polling", () => {
    const held = run([
      start({ holdBoot: true }),
      g1.firstFrame(1_000),
      g1.meadow(1_000),
      vignetteDone(1_000),
      g1.assets(1_000, COMPLETE),
      tick(1_000 + P.assetSettleMs),
      tick(100_000),
    ]);
    const heldView = view(held);

    expect(held.status).toBe("booting");
    expect(held.deadline).toBe(null);
    expect(heldView.documentPhase).toBe("pending");
    expect(heldView.revealed).toBe(false);
    expect(heldView.awaitingReveal).toBe(false);
  });
});

describe("pre-paint timeout handed to hydration", () => {
  it("stays on the document when hydration arrives after the fail-open", () => {
    // The visitor has already been reading the flat page for twenty seconds.
    // Putting the boot screen back over it and starting a fresh forty-second
    // wait is the same hang, seen from further along.
    const late = run([start({ at: 25_000, prepaintTimedOut: true })]);
    expect(late.status).toBe("failed");
    expect(late.failure).toBe("hang");
    const v = view(late);
    expect(v.documentPhase).toBe(null);
    expect(v.mode).toBe("flat");
    expect(v.worldMounted).toBe(false);
    expect(v.flatMounted).toBe(true);
    expect(v.flatAnimated).toBe(true);
    // And no second backstop is armed on top of the one that already fired.
    expect(v.deadlineAt).toBe(null);
  });

  it("does not resurrect the boot screen on any later signal", () => {
    const late = run([
      start({ at: 25_000, prepaintTimedOut: true }),
      g1.firstFrame(25_100),
      g1.meadow(25_100),
      g1.assets(25_100, COMPLETE),
      vignetteDone(25_100),
      tick(30_000),
    ]);
    expect(late.status).toBe("failed");
    expect(view(late).mode).toBe("flat");
  });

  it("lets a deliberate re-entry boot normally afterwards", () => {
    // The outcome speaks for one document load. Navigating away and coming
    // back is a new decision, and the visitor asked for it.
    const late = run([start({ at: 25_000, prepaintTimedOut: true })]);
    const exited = run([gen(1).exit(30_000)], late);
    const again = run([start({ at: 40_000, prepaintTimedOut: false })], exited);
    expect(again.status).toBe("booting");
    expect(again.epoch).toBe(2);
    expect(again.deadline).toEqual({
      kind: "hangBackstop",
      at: 40_000 + P.hangBackstopMs,
    });
    expect(view(again).documentPhase).toBe("pending");
  });

  it("still prefers the document when the visitor was never eligible", () => {
    const v = view(
      run([start({ prepaintTimedOut: true, prefersReducedMotion: true })]),
    );
    expect(v.status).toBe("ineligible");
    expect(v.failure).toBe(null);
  });
});

describe("asset readiness", () => {
  it("believes only an idle manager that loaded every requested item", () => {
    expect(assetLoadComplete({ ...COMPLETE, active: true })).toBe(false);
    expect(assetLoadComplete({ ...COMPLETE, total: 0, loaded: 0 })).toBe(false);
    expect(assetLoadComplete({ ...COMPLETE, loaded: 9 })).toBe(false);
    expect(assetLoadComplete({ ...COMPLETE, errors: 1 })).toBe(false);
    expect(assetLoadComplete(COMPLETE)).toBe(true);
    expect(assetLoadComplete({ ...COMPLETE, loaded: 11 })).toBe(true);
  });

  it("holds the reveal until the manager has been quiet for the settle window", () => {
    const ready = run([
      start(),
      g1.firstFrame(1_000),
      g1.meadow(1_000),
      vignetteDone(1_000),
      g1.assets(1_000, COMPLETE),
    ]);
    expect(ready.status).toBe("booting");
    expect(run([tick(1_000 + P.assetSettleMs - 1)], ready).status).toBe(
      "booting",
    );
    expect(run([tick(1_000 + P.assetSettleMs)], ready).status).toBe(
      "revealing",
    );
  });

  it("restarts the settle window when a later batch begins", () => {
    const restarted = run([
      start(),
      g1.firstFrame(1_000),
      g1.meadow(1_000),
      vignetteDone(1_000),
      g1.assets(1_000, COMPLETE),
      g1.assets(1_100, LOADING),
    ]);
    expect(restarted.assetsCompleteSince).toBe(null);
    expect(run([tick(9_000)], restarted).status).toBe("booting");
  });

  it("keeps the original completion time while the manager stays complete", () => {
    const held = run([
      start(),
      g1.assets(1_000, COMPLETE),
      g1.assets(1_200, { ...COMPLETE, loaded: 10 }),
    ]);
    expect(held.assetsCompleteSince).toBe(1_000);
  });
});

describe("reveal gate", () => {
  const AT = 5_000;
  const SIGNALS = ["firstFrame", "assets", "meadow", "bootVignette"] as const;

  function sendSignal(state: WorldBootState, signal: (typeof SIGNALS)[number]) {
    if (signal === "assets")
      return reduceWorldBoot(state, g1.assets(AT, COMPLETE), P);
    if (signal === "firstFrame")
      return reduceWorldBoot(state, g1.firstFrame(AT), P);
    if (signal === "meadow") return reduceWorldBoot(state, g1.meadow(AT), P);
    return reduceWorldBoot(state, vignetteDone(AT), P);
  }

  it.each(SIGNALS)("refuses to reveal while %s is outstanding", (missing) => {
    let state = run([start()]);
    for (const signal of SIGNALS) {
      if (signal !== missing) state = sendSignal(state, signal);
    }
    state = reduceWorldBoot(state, tick(AT + P.assetSettleMs), P);
    expect(state.status).toBe("booting");
  });

  it("reveals once all four have landed, in any order", () => {
    const orders: (typeof SIGNALS)[number][][] = [
      ["firstFrame", "assets", "meadow", "bootVignette"],
      ["bootVignette", "meadow", "assets", "firstFrame"],
      ["assets", "bootVignette", "firstFrame", "meadow"],
      ["meadow", "firstFrame", "bootVignette", "assets"],
    ];
    for (const order of orders) {
      let state = run([start()]);
      for (const signal of order) state = sendSignal(state, signal);
      state = reduceWorldBoot(state, tick(AT + P.assetSettleMs), P);
      expect(state.status).toBe("revealing");
    }
  });

  it("only polls for the reveal once a frame has been painted", () => {
    expect(view(bootedTo("booting")).awaitingReveal).toBe(false);
    const painted = run([g1.firstFrame(5)], bootedTo("booting"));
    expect(view(painted).awaitingReveal).toBe(true);
    expect(view(painted).canvasReady).toBe(true);
    expect(view(bootedTo("revealing")).awaitingReveal).toBe(false);
  });

  it("closes the meadow gate during a diagnostics off-to-on remount", () => {
    const ready = run([start(), g1.meadow(10)]);
    expect(ready.meadowReady).toBe(true);
    const remounting = run([g1.meadowPending(20)], ready);
    expect(remounting.meadowReady).toBe(false);
    expect(run([g1.meadow(30)], remounting).meadowReady).toBe(true);
  });
});

describe("boot vignette lifecycle", () => {
  it("keeps a pass that completed before the world's owner streamed in", () => {
    // The vignette ships in the entry bundle and can finish before the
    // streamed homepage data resolves. Clearing it at start would leave the
    // reveal waiting on a signal nobody will send again.
    const early = run([vignetteStarted(50), vignetteDone(100)]);
    const started = run([start({ at: 200 })], early);
    expect(started.bootVignetteReady).toBe(true);
    const revealed = run(
      [
        g1.firstFrame(300),
        g1.meadow(300),
        g1.assets(300, COMPLETE),
        tick(300 + P.assetSettleMs),
      ],
      started,
    );
    expect(revealed.status).toBe("revealing");
  });

  it("waits again when the vignette restarts its pass", () => {
    const restarted = run([
      start(),
      vignetteDone(100),
      vignetteStarted(150),
      g1.firstFrame(200),
      g1.meadow(200),
      g1.assets(200, COMPLETE),
      tick(200 + P.assetSettleMs),
    ]);
    expect(restarted.status).toBe("booting");
  });

  it("records a new pass that begins and completes after a route change", () => {
    // exit -> started -> completed -> start. The vignette signals arrive while
    // the machine is `exited`, which used to drop them on the floor.
    const exited = run([g1.exit(1_000)], bootedTo("live"));
    const nextPass = run([vignetteStarted(1_100), vignetteDone(1_400)], exited);
    expect(nextPass.bootVignetteReady).toBe(true);
    const started = run([start({ at: 1_500 })], nextPass);
    expect(started.bootVignetteReady).toBe(true);
    const revealed = run(
      [
        g2.firstFrame(1_600),
        g2.meadow(1_600),
        g2.assets(1_600, COMPLETE),
        tick(1_600 + P.assetSettleMs),
      ],
      started,
    );
    expect(revealed.status).toBe("revealing");
  });

  it("records a new pass that completes after the next boot begins", () => {
    // exit -> started -> start -> completed. The pass is open across the
    // start, so the new boot must wait for it and then reveal.
    const exited = run([g1.exit(1_000)], bootedTo("live"));
    const started = run([vignetteStarted(1_100), start({ at: 1_200 })], exited);
    expect(started.bootVignetteReady).toBe(false);
    const waiting = run(
      [
        g2.firstFrame(1_300),
        g2.meadow(1_300),
        g2.assets(1_300, COMPLETE),
        tick(1_300 + P.assetSettleMs),
      ],
      started,
    );
    expect(waiting.status).toBe("booting");
    expect(run([vignetteDone(1_800)], waiting).status).toBe("revealing");
  });

  it("never carries a completed pass across a route change on its own", () => {
    // exit -> start, with no vignette signal in between. The pass the flag
    // describes belongs to the page that just left, so the new boot must not
    // open its reveal gate on it.
    const exited = run([g1.exit(1_000)], bootedTo("live"));
    expect(exited.bootVignetteReady).toBe(false);
    const started = run([start({ at: 1_100 })], exited);
    expect(started.bootVignetteReady).toBe(false);
    const waiting = run(
      [
        g2.firstFrame(1_200),
        g2.meadow(1_200),
        g2.assets(1_200, COMPLETE),
        tick(1_200 + P.assetSettleMs),
      ],
      started,
    );
    expect(waiting.status).toBe("booting");
  });

  it("accepts vignette signals after a demotion without reviving the world", () => {
    const failed = run([g1.runtimeError(500)], bootedTo("booting"));
    const withPass = run([vignetteStarted(600), vignetteDone(900)], failed);
    expect(withPass.bootVignetteReady).toBe(true);
    expect(withPass.status).toBe("failed");
    expect(view(withPass).mode).toBe("flat");
  });
});

describe("stale signals from an older generation", () => {
  it.each([
    ["a painted frame", (at: number) => g1.firstFrame(at)],
    ["a completed asset batch", (at: number) => g1.assets(at, COMPLETE)],
    ["filled meadow buffers", (at: number) => g1.meadow(at)],
    ["a meadow readiness reset", (at: number) => g1.meadowPending(at)],
  ])("ignores %s from the previous boot", (_label, event) => {
    // A queued frame or a draining loading manager from the world that was
    // just torn down. Accepting it would open the new boot's reveal gate on a
    // canvas that has not painted.
    const exited = run([g1.exit(1_000)], bootedTo("live"));
    const restarted = run([start({ at: 1_100 })], exited);
    const polluted = run([event(1_200)], restarted);
    expect(polluted).toBe(restarted);
    expect(polluted.firstFrame).toBe(false);
    expect(polluted.meadowReady).toBe(false);
    expect(polluted.assetsCompleteSince).toBe(null);
  });

  it.each([
    ["a lost context", (at: number) => g1.contextLost(at)],
    ["a scene throw", (at: number) => g1.runtimeError(at)],
  ])("ignores %s from the previous boot", (_label, event) => {
    // The dying canvas losing its context must not demote the world the
    // visitor just came back to.
    const exited = run([g1.exit(1_000)], bootedTo("live"));
    const restarted = run([start({ at: 1_100 })], exited);
    const polluted = run([event(1_200)], restarted);
    expect(polluted).toBe(restarted);
    expect(polluted.status).toBe("booting");
    expect(polluted.failure).toBe(null);
    expect(view(polluted).mode).toBe("world");
  });

  it("ignores a stale exit so a late cleanup cannot unmount the live world", () => {
    const restarted = run(
      [start({ at: 1_100 })],
      run([g1.exit(1_000)], bootedTo("live")),
    );
    const polluted = run([g1.exit(1_200)], restarted);
    expect(polluted).toBe(restarted);
    expect(polluted.status).toBe("booting");
  });

  it("still accepts signals stamped with the live generation", () => {
    const restarted = run(
      [start({ at: 1_100 })],
      run([g1.exit(1_000)], bootedTo("live")),
    );
    expect(run([g2.firstFrame(1_200)], restarted).firstFrame).toBe(true);
    expect(run([g2.meadow(1_200)], restarted).meadowReady).toBe(true);
    expect(run([g2.contextLost(1_200)], restarted).status).toBe("failed");
  });

  it("ignores signals stamped with a generation that does not exist yet", () => {
    const booting = bootedTo("booting");
    expect(run([g2.firstFrame(10)], booting)).toBe(booting);
    expect(run([gen(0).firstFrame(10)], booting)).toBe(booting);
  });
});

describe("reveal and cleanup timing", () => {
  it("flips the handshake to ready and holds the flat content for the cross-fade", () => {
    const v = view(bootedTo("revealing"));
    expect(v.status).toBe("revealing");
    expect(v.documentPhase).toBe("ready");
    expect(v.revealed).toBe(true);
    expect(v.flatMounted).toBe(true);
    expect(v.deadlineKind).toBe("flatRetire");
  });

  it("retires the flat content exactly one cross-fade later", () => {
    const revealing = bootedTo("revealing");
    const at = revealing.deadline?.at ?? 0;
    expect(view(run([tick(at - 1)], revealing)).status).toBe("revealing");
    const live = run([tick(at)], revealing);
    expect(live.status).toBe("live");
    expect(view(live).flatMounted).toBe(false);
    expect(view(live).documentPhase).toBe("ready");
    expect(view(live).deadlineAt).toBe(null);
  });

  it("measures the cross-fade from the reveal, not from the start", () => {
    const revealing = bootedTo("revealing", 30_000);
    expect(revealing.deadline).toEqual({
      kind: "flatRetire",
      at: 30_000 + 10 + P.assetSettleMs + P.flatRetireMs,
    });
  });
});

describe("hang backstop", () => {
  it("arms React's backstop on a hydrated start", () => {
    expect(run([start({ at: 1_000 })]).deadline).toEqual({
      kind: "hangBackstop",
      at: 1_000 + P.hangBackstopMs,
    });
  });

  it("arms the shorter pre-paint backstop before React exists", () => {
    expect(run([start({ at: 0, origin: "prepaint" })]).deadline).toEqual({
      kind: "prepaintBackstop",
      at: P.prepaintBackstopMs,
    });
  });

  it("fails open to the document when the boot genuinely wedges", () => {
    const wedged = run(
      [tick(P.hangBackstopMs)],
      run([start(), g1.firstFrame(10)]),
    );
    expect(wedged.status).toBe("failed");
    expect(wedged.failure).toBe("hang");
    const v = view(wedged);
    expect(v.documentPhase).toBe(null);
    expect(v.mode).toBe("flat");
    expect(v.worldMounted).toBe(false);
    expect(v.flatMounted).toBe(true);
    expect(v.flatAnimated).toBe(true);
    expect(v.deadlineAt).toBe(null);
  });

  it("does not fire one millisecond early", () => {
    expect(run([tick(P.hangBackstopMs - 1)], run([start()])).status).toBe(
      "booting",
    );
  });

  it("prefers a reveal that lands in the same millisecond as the backstop", () => {
    const armed = run([
      start(),
      g1.firstFrame(10),
      g1.meadow(10),
      vignetteDone(10),
      g1.assets(P.hangBackstopMs - P.assetSettleMs, COMPLETE),
    ]);
    expect(run([tick(P.hangBackstopMs)], armed).status).toBe("revealing");
  });

  it("disarms once the world is revealed", () => {
    const revealing = bootedTo("revealing");
    expect(revealing.deadline?.kind).toBe("flatRetire");
    expect(run([tick(P.hangBackstopMs)], revealing).status).toBe("live");
  });

  it("lets an OG capture wait as long as it needs", () => {
    const capture = run([start({ ogCapture: true })]);
    expect(capture.deadline).toBe(null);
    expect(view(capture).ogCapture).toBe(true);
    expect(run([tick(10 * P.hangBackstopMs)], capture).status).toBe("booting");
  });

  it("marks an OG capture even when the world is not viable", () => {
    expect(
      view(run([start({ ogCapture: true, webglAvailable: false })])).ogCapture,
    ).toBe(true);
  });
});

describe("runtime failure", () => {
  it.each([
    ["a scene throw", (at: number) => g1.runtimeError(at), "runtimeError"],
    ["a lost context", (at: number) => g1.contextLost(at), "contextLost"],
  ])("restores the document on %s while booting", (_label, event, failure) => {
    const failed = run([event(500)], bootedTo("booting"));
    expect(failed.status).toBe("failed");
    expect(failed.failure).toBe(failure);
    expect(view(failed).documentPhase).toBe(null);
    expect(view(failed).mode).toBe("flat");
  });

  it.each(["revealing", "live"] as const)(
    "restores the document when the context is lost after the world is %s",
    (status) => {
      const failed = run([g1.contextLost(90_000)], bootedTo(status));
      expect(failed.status).toBe("failed");
      // A visitor who was reading the room gets the flat page back, animated,
      // rather than a frozen canvas.
      expect(view(failed).flatMounted).toBe(true);
      expect(view(failed).flatAnimated).toBe(true);
      expect(view(failed).worldMounted).toBe(false);
    },
  );

  it("keeps the first failure's cause", () => {
    const failed = run(
      [g1.contextLost(500), g1.runtimeError(600)],
      bootedTo("booting"),
    );
    expect(failed.failure).toBe("contextLost");
  });

  it("ignores late readiness signals after a failure", () => {
    const failed = run([g1.runtimeError(500)], bootedTo("booting"));
    const later = run(
      [
        g1.firstFrame(600),
        g1.meadow(600),
        g1.assets(600, COMPLETE),
        tick(60_000),
      ],
      failed,
    );
    expect(later.status).toBe("failed");
  });
});

describe("route exit", () => {
  it.each(["booting", "revealing", "live"] as const)(
    "clears the handshake when the homepage unmounts while %s",
    (status) => {
      const exited = run([g1.exit(99_999)], bootedTo(status));
      expect(exited.status).toBe("exited");
      const v = view(exited);
      // SPA navigation must not carry the world's overscroll lock onto a
      // document route.
      expect(v.documentPhase).toBe(null);
      expect(v.ownsDocument).toBe(true);
      expect(v.worldMounted).toBe(false);
      expect(v.flatMounted).toBe(true);
      expect(v.deadlineAt).toBe(null);
      expect(v.ogCapture).toBe(false);
    },
  );

  it("stays exited under every later world signal", () => {
    const exited = run([g1.exit(1_000)], bootedTo("booting"));
    for (const event of [
      g1.firstFrame(1_100),
      g1.meadow(1_100),
      g1.meadowPending(1_100),
      g1.assets(1_100, COMPLETE),
      g1.contextLost(1_100),
      g1.runtimeError(1_100),
      g1.exit(1_100),
      tick(500_000),
    ]) {
      expect(reduceWorldBoot(exited, event, P)).toBe(exited);
    }
  });

  it("boots again when the visitor navigates back to the homepage", () => {
    const exited = run([g1.exit(1_000)], bootedTo("live"));
    const again = run([start({ at: 2_000 })], exited);
    expect(again.status).toBe("booting");
    expect(again.epoch).toBe(2);
    expect(again.deadline).toEqual({
      kind: "hangBackstop",
      at: 2_000 + P.hangBackstopMs,
    });
    expect(view(again).documentPhase).toBe("pending");
  });

  it("clears world readiness on a fresh start", () => {
    const restarted = run([start({ at: 90_000 })], bootedTo("live"));
    expect(restarted.status).toBe("booting");
    expect(restarted.firstFrame).toBe(false);
    expect(restarted.meadowReady).toBe(false);
    expect(restarted.assetsCompleteSince).toBe(null);
    expect(restarted.failure).toBe(null);
  });

  it("drops an OG capture's suppression when the route changes", () => {
    const exited = run([g1.exit(1_000)], run([start({ ogCapture: true })]));
    expect(view(exited).ogCapture).toBe(false);
  });
});

describe("totality", () => {
  function everyEvent(epoch: number): WorldBootEvent[] {
    const g = gen(epoch);
    return [
      start({ at: 7 }),
      g.firstFrame(7),
      g.assets(7, COMPLETE),
      g.assets(7, LOADING),
      g.meadow(7),
      g.meadowPending(7),
      vignetteStarted(7),
      vignetteDone(7),
      g.runtimeError(7),
      g.contextLost(7),
      g.exit(7),
      tick(7),
    ];
  }

  const STATES: Record<WorldBootStatus, () => WorldBootState> = {
    unstarted: () => initialWorldBootState(),
    ineligible: () => run([start({ saveData: true })]),
    booting: () => bootedTo("booting"),
    revealing: () => bootedTo("revealing"),
    live: () => bootedTo("live"),
    failed: () => run([g1.runtimeError(5)], bootedTo("booting")),
    exited: () => run([g1.exit(5)], bootedTo("booting")),
  };

  it("accepts every event in every state and always projects a homepage", () => {
    for (const [status, make] of Object.entries(STATES)) {
      // Both a live-generation and a stale-generation copy of every signal.
      for (const epoch of [0, 1, 2]) {
        for (const event of everyEvent(epoch)) {
          const next = reduceWorldBoot(make(), event, P);
          const v = worldBootView(next);
          expect(
            v.worldMounted || v.flatMounted,
            `${status} + ${event.type} @${epoch} left nothing on screen`,
          ).toBe(true);
          // The world and the flat page are never both the animated homepage.
          expect(v.flatAnimated).toBe(!v.worldMounted);
          // The attribute only ever says "ready" once the world is revealed.
          expect(v.documentPhase === "ready").toBe(v.revealed);
          expect(v.deadlineAt === null).toBe(v.deadlineKind === null);
        }
      }
    }
  });

  it("returns the same state object when nothing observable changed", () => {
    const booting = bootedTo("booting");
    expect(reduceWorldBoot(booting, tick(1), P)).toBe(booting);
    const withMeadow = reduceWorldBoot(booting, g1.meadow(1), P);
    expect(reduceWorldBoot(withMeadow, g1.meadow(2), P)).toBe(withMeadow);
  });

  it("names the phases the boot screen must stay up for", () => {
    expect(isBootingPhase("pending")).toBe(true);
    expect(isBootingPhase("warm")).toBe(true);
    expect(isBootingPhase("ready")).toBe(false);
    expect(isBootingPhase(null)).toBe(false);
  });
});
