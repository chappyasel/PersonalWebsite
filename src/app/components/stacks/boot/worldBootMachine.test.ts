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
    warm: { source: "documentPhase", phase: null },
    ...overrides,
  };
}

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

/** The shortest path from a cold start to a revealed world. */
function bootedTo(status: "booting" | "revealing" | "live", t = 0) {
  const booting = run([start({ at: t })]);
  if (status === "booting") return booting;
  const revealing = run(
    [
      { type: "firstFrame", at: t + 10 },
      { type: "assetLoad", at: t + 10, assets: COMPLETE },
      { type: "meadowReady", at: t + 10 },
      { type: "bootVignetteCompleted", at: t + 10 },
      { type: "tick", at: t + 10 + P.assetSettleMs },
    ],
    booting,
  );
  if (status === "revealing") return revealing;
  return run(
    [{ type: "tick", at: t + 10 + P.assetSettleMs + P.flatRetireMs }],
    revealing,
  );
}

describe("initial capability", () => {
  it("renders the flat document before any decision is made", () => {
    const v = view(initialWorldBootState());
    expect(v.status).toBe("unstarted");
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
    ["no WebGL", { webglAvailable: false }],
    ["reduced motion", { prefersReducedMotion: true }],
    ["Save-Data", { saveData: true }],
    [
      "reduced motion and Save-Data together",
      { prefersReducedMotion: true, saveData: true },
    ],
    ["no WebGL despite a warm record", { webglAvailable: false }],
  ])("keeps the document when the visitor has %s", (_label, overrides) => {
    const v = view(run([start(overrides)]));
    expect(v.status).toBe("ineligible");
    expect(v.mode).toBe("flat");
    expect(v.documentPhase).toBe(null);
    expect(v.ownsDocument).toBe(true);
    expect(v.deadlineAt).toBe(null);
  });

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
    const ready = run(
      [
        start(),
        { type: "firstFrame", at: 1_000 },
        { type: "meadowReady", at: 1_000 },
        { type: "bootVignetteCompleted", at: 1_000 },
        { type: "assetLoad", at: 1_000, assets: COMPLETE },
      ],
      initialWorldBootState(),
    );
    expect(ready.status).toBe("booting");
    expect(
      run([{ type: "tick", at: 1_000 + P.assetSettleMs - 1 }], ready).status,
    ).toBe("booting");
    expect(
      run([{ type: "tick", at: 1_000 + P.assetSettleMs }], ready).status,
    ).toBe("revealing");
  });

  it("restarts the settle window when a later batch begins", () => {
    const restarted = run([
      start(),
      { type: "firstFrame", at: 1_000 },
      { type: "meadowReady", at: 1_000 },
      { type: "bootVignetteCompleted", at: 1_000 },
      { type: "assetLoad", at: 1_000, assets: COMPLETE },
      { type: "assetLoad", at: 1_100, assets: LOADING },
    ]);
    expect(restarted.assetsCompleteSince).toBe(null);
    expect(run([{ type: "tick", at: 9_000 }], restarted).status).toBe(
      "booting",
    );
  });

  it("keeps the original completion time while the manager stays complete", () => {
    const held = run([
      start(),
      { type: "assetLoad", at: 1_000, assets: COMPLETE },
      { type: "assetLoad", at: 1_200, assets: { ...COMPLETE, loaded: 10 } },
    ]);
    expect(held.assetsCompleteSince).toBe(1_000);
  });
});

describe("reveal gate", () => {
  const AT = 5_000;
  const SIGNALS = ["firstFrame", "assets", "meadow", "bootVignette"] as const;

  function sendSignal(state: WorldBootState, signal: (typeof SIGNALS)[number]) {
    if (signal === "assets")
      return reduceWorldBoot(
        state,
        { type: "assetLoad", at: AT, assets: COMPLETE },
        P,
      );
    if (signal === "firstFrame")
      return reduceWorldBoot(state, { type: "firstFrame", at: AT }, P);
    if (signal === "meadow")
      return reduceWorldBoot(state, { type: "meadowReady", at: AT }, P);
    return reduceWorldBoot(state, { type: "bootVignetteCompleted", at: AT }, P);
  }

  it.each(SIGNALS)("refuses to reveal while %s is outstanding", (missing) => {
    let state = run([start()]);
    for (const signal of SIGNALS) {
      if (signal !== missing) state = sendSignal(state, signal);
    }
    state = reduceWorldBoot(
      state,
      { type: "tick", at: AT + P.assetSettleMs },
      P,
    );
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
      state = reduceWorldBoot(
        state,
        { type: "tick", at: AT + P.assetSettleMs },
        P,
      );
      expect(state.status).toBe("revealing");
    }
  });

  it("only polls for the reveal once a frame has been painted", () => {
    expect(view(bootedTo("booting")).awaitingReveal).toBe(false);
    const painted = run([{ type: "firstFrame", at: 5 }], bootedTo("booting"));
    expect(view(painted).awaitingReveal).toBe(true);
    expect(view(painted).canvasReady).toBe(true);
    expect(view(bootedTo("revealing")).awaitingReveal).toBe(false);
  });

  it("keeps the boot vignette's completed pass across a late start", () => {
    // The vignette ships in the entry bundle and can finish its pass before
    // the streamed homepage data resolves and the world's owner mounts.
    const early = run([{ type: "bootVignetteCompleted", at: 100 }]);
    const started = run([start({ at: 200 })], early);
    expect(started.bootVignetteReady).toBe(true);
    const revealed = run(
      [
        { type: "firstFrame", at: 300 },
        { type: "meadowReady", at: 300 },
        { type: "assetLoad", at: 300, assets: COMPLETE },
        { type: "tick", at: 300 + P.assetSettleMs },
      ],
      started,
    );
    expect(revealed.status).toBe("revealing");
  });

  it("waits again when the vignette restarts its pass", () => {
    const restarted = run([
      start(),
      { type: "bootVignetteCompleted", at: 100 },
      { type: "bootVignetteStarted", at: 150 },
      { type: "firstFrame", at: 200 },
      { type: "meadowReady", at: 200 },
      { type: "assetLoad", at: 200, assets: COMPLETE },
      { type: "tick", at: 200 + P.assetSettleMs },
    ]);
    expect(restarted.status).toBe("booting");
  });

  it("clears world readiness on a fresh start but not the vignette's pass", () => {
    const live = bootedTo("live");
    const restarted = run([start({ at: 90_000 })], live);
    expect(restarted.status).toBe("booting");
    expect(restarted.firstFrame).toBe(false);
    expect(restarted.meadowReady).toBe(false);
    expect(restarted.assetsCompleteSince).toBe(null);
    expect(restarted.failure).toBe(null);
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
    expect(view(run([{ type: "tick", at: at - 1 }], revealing)).status).toBe(
      "revealing",
    );
    const live = run([{ type: "tick", at }], revealing);
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
    const state = run([start({ at: 1_000 })]);
    expect(state.deadline).toEqual({
      kind: "hangBackstop",
      at: 1_000 + P.hangBackstopMs,
    });
  });

  it("arms the shorter pre-paint backstop before React exists", () => {
    const state = run([start({ at: 0, origin: "prepaint" })]);
    expect(state.deadline).toEqual({
      kind: "prepaintBackstop",
      at: P.prepaintBackstopMs,
    });
  });

  it("fails open to the document when the boot genuinely wedges", () => {
    const wedged = run(
      [{ type: "tick", at: P.hangBackstopMs }],
      run([start(), { type: "firstFrame", at: 10 }]),
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
    expect(
      run([{ type: "tick", at: P.hangBackstopMs - 1 }], run([start()])).status,
    ).toBe("booting");
  });

  it("prefers a reveal that lands in the same millisecond as the backstop", () => {
    const armed = run([
      start(),
      { type: "firstFrame", at: 10 },
      { type: "meadowReady", at: 10 },
      { type: "bootVignetteCompleted", at: 10 },
      {
        type: "assetLoad",
        at: P.hangBackstopMs - P.assetSettleMs,
        assets: COMPLETE,
      },
    ]);
    expect(run([{ type: "tick", at: P.hangBackstopMs }], armed).status).toBe(
      "revealing",
    );
  });

  it("disarms once the world is revealed", () => {
    const revealing = bootedTo("revealing");
    expect(revealing.deadline?.kind).toBe("flatRetire");
    expect(
      run([{ type: "tick", at: P.hangBackstopMs }], revealing).status,
    ).toBe("live");
  });

  it("lets an OG capture wait as long as it needs", () => {
    const capture = run([start({ ogCapture: true })]);
    expect(capture.deadline).toBe(null);
    expect(view(capture).ogCapture).toBe(true);
    expect(
      run([{ type: "tick", at: 10 * P.hangBackstopMs }], capture).status,
    ).toBe("booting");
  });

  it("marks an OG capture even when the world is not viable", () => {
    expect(
      view(run([start({ ogCapture: true, webglAvailable: false })])).ogCapture,
    ).toBe(true);
  });
});

describe("runtime failure", () => {
  it.each<
    [
      Extract<WorldBootEvent, { type: "runtimeError" | "contextLost" }>["type"],
      string,
    ]
  >([
    ["runtimeError", "runtimeError"],
    ["contextLost", "contextLost"],
  ])("restores the document on %s while booting", (type, failure) => {
    const failed = run([{ type, at: 500 }], bootedTo("booting"));
    expect(failed.status).toBe("failed");
    expect(failed.failure).toBe(failure);
    expect(view(failed).documentPhase).toBe(null);
    expect(view(failed).mode).toBe("flat");
  });

  it.each(["revealing", "live"] as const)(
    "restores the document when the context is lost after the world is %s",
    (status) => {
      const failed = run(
        [{ type: "contextLost", at: 90_000 }],
        bootedTo(status),
      );
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
      [
        { type: "contextLost", at: 500 },
        { type: "runtimeError", at: 600 },
      ],
      bootedTo("booting"),
    );
    expect(failed.failure).toBe("contextLost");
  });

  it("ignores late readiness signals after a failure", () => {
    const failed = run(
      [{ type: "runtimeError", at: 500 }],
      bootedTo("booting"),
    );
    const later = run(
      [
        { type: "firstFrame", at: 600 },
        { type: "meadowReady", at: 600 },
        { type: "bootVignetteCompleted", at: 600 },
        { type: "assetLoad", at: 600, assets: COMPLETE },
        { type: "tick", at: 60_000 },
      ],
      failed,
    );
    expect(later.status).toBe("failed");
  });

  it("does nothing when the world was never viable", () => {
    const ineligible = run([start({ webglAvailable: false })]);
    expect(run([{ type: "contextLost", at: 5 }], ineligible).status).toBe(
      "failed",
    );
    // Either way the visitor sees the same document; the cause is only there
    // so diagnostics can tell a demotion from a policy decision.
    expect(view(run([{ type: "contextLost", at: 5 }], ineligible)).mode).toBe(
      "flat",
    );
  });
});

describe("route exit", () => {
  it.each(["booting", "revealing", "live"] as const)(
    "clears the handshake when the homepage unmounts while %s",
    (status) => {
      const exited = run([{ type: "exit", at: 99_999 }], bootedTo(status));
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

  it("stays exited under every later signal", () => {
    const exited = run([{ type: "exit", at: 1_000 }], bootedTo("booting"));
    for (const event of [
      { type: "firstFrame", at: 1_100 },
      { type: "meadowReady", at: 1_100 },
      { type: "bootVignetteCompleted", at: 1_100 },
      { type: "contextLost", at: 1_100 },
      { type: "runtimeError", at: 1_100 },
      { type: "exit", at: 1_100 },
      { type: "tick", at: 500_000 },
    ] satisfies WorldBootEvent[]) {
      expect(reduceWorldBoot(exited, event, P)).toBe(exited);
    }
  });

  it("boots again when the visitor navigates back to the homepage", () => {
    const exited = run([{ type: "exit", at: 1_000 }], bootedTo("live"));
    const again = run([start({ at: 2_000 })], exited);
    expect(again.status).toBe("booting");
    expect(again.deadline).toEqual({
      kind: "hangBackstop",
      at: 2_000 + P.hangBackstopMs,
    });
    expect(view(again).documentPhase).toBe("pending");
  });

  it("drops an OG capture's suppression when the route changes", () => {
    const exited = run(
      [{ type: "exit", at: 1_000 }],
      run([start({ ogCapture: true })]),
    );
    expect(view(exited).ogCapture).toBe(false);
  });
});

describe("totality", () => {
  const EVERY_EVENT: WorldBootEvent[] = [
    start({ at: 7 }),
    { type: "firstFrame", at: 7 },
    { type: "assetLoad", at: 7, assets: COMPLETE },
    { type: "assetLoad", at: 7, assets: LOADING },
    { type: "meadowReady", at: 7 },
    { type: "bootVignetteStarted", at: 7 },
    { type: "bootVignetteCompleted", at: 7 },
    { type: "runtimeError", at: 7 },
    { type: "contextLost", at: 7 },
    { type: "exit", at: 7 },
    { type: "tick", at: 7 },
  ];

  const STATES: Record<WorldBootStatus, () => WorldBootState> = {
    unstarted: () => initialWorldBootState(),
    ineligible: () => run([start({ saveData: true })]),
    booting: () => bootedTo("booting"),
    revealing: () => bootedTo("revealing"),
    live: () => bootedTo("live"),
    failed: () => run([{ type: "runtimeError", at: 5 }], bootedTo("booting")),
    exited: () => run([{ type: "exit", at: 5 }], bootedTo("booting")),
  };

  it("accepts every event in every state and always projects a homepage", () => {
    for (const [status, make] of Object.entries(STATES)) {
      for (const event of EVERY_EVENT) {
        const next = reduceWorldBoot(make(), event, P);
        const v = worldBootView(next);
        expect(
          v.worldMounted || v.flatMounted,
          `${status} + ${event.type} left nothing on screen`,
        ).toBe(true);
        // The world and the flat page are never both the animated homepage.
        expect(v.flatAnimated).toBe(!v.worldMounted);
        // The attribute only ever says "ready" once the world is revealed.
        expect(v.documentPhase === "ready").toBe(v.revealed);
        expect(v.deadlineAt === null).toBe(v.deadlineKind === null);
      }
    }
  });

  it("returns the same state object when nothing observable changed", () => {
    const booting = bootedTo("booting");
    expect(reduceWorldBoot(booting, { type: "tick", at: 1 }, P)).toBe(booting);
    const withMeadow = reduceWorldBoot(
      booting,
      { type: "meadowReady", at: 1 },
      P,
    );
    expect(reduceWorldBoot(withMeadow, { type: "meadowReady", at: 2 }, P)).toBe(
      withMeadow,
    );
  });

  it("names the phases the boot screen must stay up for", () => {
    expect(isBootingPhase("pending")).toBe(true);
    expect(isBootingPhase("warm")).toBe(true);
    expect(isBootingPhase("ready")).toBe(false);
    expect(isBootingPhase(null)).toBe(false);
  });
});
