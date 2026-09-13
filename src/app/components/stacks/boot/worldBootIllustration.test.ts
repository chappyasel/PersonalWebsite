import { describe, expect, it } from "vitest";

import {
  type WorldBootEvent,
  type WorldBootState,
  initialWorldBootState,
  reduceWorldBoot,
  worldBootView,
} from "./worldBootMachine";
import { WORLD_BOOT_POLICY as P } from "./worldBootPolicy";

const KEY = "projects:light:1440x900:revision-1";
const NEXT_KEY = "books:dark:390x844:revision-2";
const completeAssets = { active: false, loaded: 10, total: 10, errors: 0 };
type Start = Extract<WorldBootEvent, { type: "start" }>;
function start(overrides: Partial<Start> = {}): Start {
  return {
    type: "start",
    at: 0,
    origin: "hydrate",
    webglAvailable: true,
    prefersReducedMotion: false,
    saveData: false,
    ogCapture: false,
    illustratedMode: true,
    prepaintTimedOut: false,
    warm: { source: "documentPhase", phase: null },
    ...overrides,
  };
}
function run(events: WorldBootEvent[], from = initialWorldBootState()) {
  return events.reduce((state, event) => reduceWorldBoot(state, event), from);
}
const tick = (at: number): WorldBootEvent => ({ type: "tick", at });
const changed = (key: string | null, at = 0): WorldBootEvent => ({
  type: "illustrationChanged",
  key,
  at,
});
const interacted = (at = 0): WorldBootEvent => ({
  type: "illustrationInteracted",
  at,
});
const registered = (key = KEY, epoch = 1, at = 300): WorldBootEvent => ({
  type: "illustrationRegistered",
  key,
  epoch,
  at,
});
const arrived = (key = KEY, epoch = 1, at = 880): WorldBootEvent => ({
  type: "illustrationTravelCompleted",
  key,
  epoch,
  at,
});
function ready(from = run([start(), changed(KEY)]), at = 10) {
  const epoch = from.epoch;
  return run(
    [
      { type: "assetLoad", epoch, at, assets: completeAssets },
      { type: "firstFrame", epoch, at },
      { type: "meadowReady", epoch, at },
      tick(at + P.assetSettleMs),
    ],
    from,
  );
}
function dissolving() {
  return run([registered()], ready());
}
function travelling() {
  return run([tick(480)], dissolving());
}
function live() {
  return run([arrived()], travelling());
}
const view = (state: WorldBootState) => worldBootView(state);

describe("illustrated promotion", () => {
  it("automatically promotes the current shelf after navigation during loading", () => {
    const browsing = run([
      start(),
      changed(KEY),
      interacted(20),
      changed(NEXT_KEY, 30),
    ]);
    const loaded = ready(browsing, 40);
    const matched = run([registered(NEXT_KEY, loaded.epoch, 1000)], loaded);
    expect(view(matched)).toMatchObject({
      presentation: "dissolve",
      canRequest3D: false,
      illustrationKey: NEXT_KEY,
    });
  });

  it("automatically fades a painted ordinary view when alignment is unavailable", () => {
    const loaded = ready();
    const painted = run(
      [
        {
          type: "illustrationOrdinaryPainted",
          key: KEY,
          epoch: 1,
          at: 300,
        },
      ],
      loaded,
    );
    expect(painted.registeredIllustrationKey).toBeNull();
    expect(view(painted)).toMatchObject({
      presentation: "dissolve",
      worldMounted: true,
      canRequest3D: false,
    });
    const travelling = run([tick(480)], painted);
    expect(view(travelling).revealed).toBe(false);
    expect(view(run([arrived()], travelling)).presentation).toBe("live");
  });

  it("rejects an ordinary frame from an old shelf or renderer", () => {
    const loaded = ready();
    for (const [key, epoch] of [
      [NEXT_KEY, 1],
      [KEY, 0],
    ] as const) {
      expect(
        run(
          [
            {
              type: "illustrationOrdinaryPainted",
              key,
              epoch,
              at: 300,
            },
          ],
          loaded,
        ),
      ).toBe(loaded);
    }
    const loading = run([start(), changed(KEY)]);
    const early = run(
      [
        {
          type: "illustrationOrdinaryPainted",
          key: KEY,
          epoch: 1,
          at: 10,
        },
      ],
      loading,
    );
    expect(view(early).presentation).toBe("illustrated");
  });

  it("keeps a usable illustration until the selected frame is registered", () => {
    const state = ready();
    expect(view(state)).toMatchObject({
      presentation: "illustrated",
      worldMounted: true,
      canvasVisible: false,
      revealed: false,
      documentPhase: "pending",
      illustrationKey: KEY,
    });
    expect(state.worldReadyAt).not.toBeNull();
    expect(run([registered(NEXT_KEY)], state)).toBe(state);
    expect(run([{ type: "bootVignetteCompleted", at: 5000 }], state)).toBe(
      state,
    );
    expect(view(run([tick(5000)], state)).presentation).toBe("illustrated");
  });

  it("requires the ordinary loading gates even after registration", () => {
    const state = run([registered(KEY, 1, 1)], run([start(), changed(KEY)]));
    expect(view(state).presentation).toBe("illustrated");
    const loaded = run(
      [
        { type: "firstFrame", epoch: 1, at: 10 },
        { type: "assetLoad", epoch: 1, at: 10, assets: completeAssets },
        tick(1000),
      ],
      state,
    );
    expect(view(loaded).presentation).toBe("illustrated");
    expect(
      view(run([{ type: "meadowReady", epoch: 1, at: 1001 }], loaded))
        .presentation,
    ).toBe("dissolve");
  });

  it("holds the camera through the dissolve and publishes ready only on arrival", () => {
    const fade = dissolving();
    expect(view(fade)).toMatchObject({
      presentation: "dissolve",
      handoffStartedAt: 300,
      canvasVisible: true,
      revealed: false,
      documentPhase: "pending",
      flatMounted: true,
    });
    expect(
      view(run([tick(300 + P.illustrationDissolveMs)], fade)).presentation,
    ).toBe("dissolve");
    expect(run([arrived(KEY, 1, 479)], fade)).toBe(fade);
    const travel = run([tick(300 + P.illustrationTravelDelayMs)], fade);
    expect(view(travel)).toMatchObject({
      presentation: "travel",
      revealed: false,
      documentPhase: "pending",
    });
    expect(run([arrived(NEXT_KEY)], travel)).toBe(travel);
    expect(view(run([arrived()], travel))).toMatchObject({
      presentation: "live",
      revealed: true,
      documentPhase: "ready",
      flatMounted: false,
    });
  });

  it("never treats either timeout as a rendered frame", () => {
    const unmatched = run([tick(P.hangBackstopMs)], ready());
    expect(view(unmatched)).toMatchObject({
      presentation: "illustrated",
      failure: "hang",
      worldMounted: false,
    });
    const travel = travelling();
    const hung = run([tick(travel.deadline!.at)], travel);
    expect(view(hung)).toMatchObject({
      presentation: "illustrated",
      failure: "hang",
      revealed: false,
      worldMounted: false,
    });
  });

  it("rejects a late loading batch at camera arrival", () => {
    const state = run(
      [
        {
          type: "assetLoad",
          epoch: 1,
          at: 800,
          assets: { ...completeAssets, active: true, loaded: 9 },
        },
      ],
      travelling(),
    );
    expect(run([arrived()], state)).toBe(state);
  });

  it("invalidates registration when section, theme, viewport or decode changes", () => {
    const state = run(
      [registered(KEY, 1, 1), changed(NEXT_KEY, 2)],
      run([start(), changed(KEY)]),
    );
    expect(state.registeredIllustrationKey).toBeNull();
    expect(view(ready(state)).presentation).toBe("illustrated");
    expect(view(run([registered()], ready(state))).presentation).toBe(
      "illustrated",
    );
    expect(view(run([registered(NEXT_KEY)], ready(state))).presentation).toBe(
      "dissolve",
    );
  });

  it.each([dissolving, travelling])(
    "cancels an active handoff on artwork change",
    (phase) => {
      const state = run([changed(null, 500)], phase());
      expect(view(state)).toMatchObject({
        presentation: "illustrated",
        worldMounted: true,
        handoffStartedAt: null,
      });
      const next = run(
        [changed(NEXT_KEY, 510), registered(NEXT_KEY, 1, 520)],
        state,
      );
      expect(view(next).presentation).toBe("dissolve");
    },
  );

  it("returns the usable illustration when matching is unavailable", () => {
    const state = run(
      [{ type: "illustrationUnavailable", epoch: 1, key: KEY, at: 300 }],
      ready(),
    );
    expect(view(state)).toMatchObject({
      status: "illustrated",
      presentation: "illustrated",
      worldMounted: false,
      canRequest3D: true,
    });
  });

  it("stops pending 3D when decode fails before the first artwork key and allows explicit retry", () => {
    const failed = run([
      start(),
      { type: "illustrationUnavailable", epoch: 1, key: null, at: 5 },
    ]);
    expect(failed).toMatchObject({
      matchUnavailable: true,
      illustrationKey: null,
      registeredIllustrationKey: null,
      deadline: null,
    });
    expect(view(failed)).toMatchObject({
      status: "illustrated",
      presentation: "illustrated",
      worldMounted: false,
      revealed: false,
      canRequest3D: true,
    });
    expect(
      run([{ type: "firstFrame", epoch: 1, at: 10 }, tick(50_000)], failed),
    ).toBe(failed);
    const retry = run([start({ at: 1000, explicitRequest: true })], failed);
    expect(view(retry)).toMatchObject({
      worldMounted: true,
      motionEnabled: false,
      revealed: false,
    });
    expect(view(ready(retry, 1100))).toMatchObject({
      presentation: "live",
      revealed: true,
      motionEnabled: true,
    });
  });

  it.each([ready, dissolving, travelling])(
    "ignores null and stale artwork failures after a current key exists",
    (phase) => {
      const current = phase();
      expect(
        run(
          [
            { type: "illustrationUnavailable", epoch: 1, key: null, at: 600 },
            {
              type: "illustrationUnavailable",
              epoch: 1,
              key: NEXT_KEY,
              at: 601,
            },
          ],
          current,
        ),
      ).toBe(current);
    },
  );

  it("rejects a prior epoch's null-key decode failure", () => {
    const current = run([start(), start({ at: 1000 })]);
    expect(current.illustrationKey).toBeNull();
    expect(
      run(
        [
          { type: "illustrationUnavailable", epoch: 1, key: null, at: 1100 },
          { type: "illustrationUnavailable", epoch: 2, key: KEY, at: 1101 },
        ],
        current,
      ),
    ).toBe(current);
    expect(
      view(
        run(
          [{ type: "illustrationUnavailable", epoch: 2, key: null, at: 1102 }],
          current,
        ),
      ).worldMounted,
    ).toBe(false);
  });
});

describe("explicit retry after an artwork mismatch", () => {
  function unavailable() {
    return run(
      [{ type: "illustrationUnavailable", epoch: 1, key: KEY, at: 300 }],
      ready(),
    );
  }

  it("keeps automatic promotion stopped after a proven mismatch", () => {
    const failed = unavailable();
    expect(failed.matchUnavailable).toBe(true);
    expect(view(failed)).toMatchObject({
      presentation: "illustrated",
      worldMounted: false,
      motionEnabled: true,
    });
    expect(run([registered(), arrived(), tick(10_000)], failed)).toBe(failed);
  });

  it("lets an explicit retry use the ordinary camera after every room gate passes", () => {
    const retry = run(
      [start({ at: 1000, explicitRequest: true })],
      unavailable(),
    );
    expect(retry).toMatchObject({
      skipIllustrationMatch: true,
      motionEnabled: true,
    });
    expect(view(retry)).toMatchObject({
      motionEnabled: false,
      worldMounted: true,
      revealed: false,
    });
    expect(
      run(
        [
          registered(KEY, 2, 1001),
          { type: "illustrationUnavailable", epoch: 2, key: KEY, at: 1002 },
        ],
        retry,
      ),
    ).toBe(retry);
    const loading = run(
      [
        { type: "assetLoad", epoch: 2, at: 1100, assets: completeAssets },
        { type: "firstFrame", epoch: 2, at: 1100 },
        tick(1100 + P.assetSettleMs),
      ],
      retry,
    );
    expect(view(loading).revealed).toBe(false);
    const entered = run([{ type: "meadowReady", epoch: 2, at: 1400 }], loading);
    expect(view(entered)).toMatchObject({
      presentation: "live",
      revealed: true,
      documentPhase: "ready",
      motionEnabled: true,
      handoffStartedAt: null,
    });
    expect(entered).toMatchObject({
      motionEnabled: true,
      skipIllustrationMatch: false,
    });
  });

  it("does not bypass matching for an explicit retry of an unfailed drawing", () => {
    const held = run([interacted(500)], ready());
    const retry = run([start({ at: 1000, explicitRequest: true })], held);
    const loaded = ready(retry, 1100);
    expect(view(loaded)).toMatchObject({
      presentation: "illustrated",
      interactionHeld: false,
      motionEnabled: true,
      revealed: false,
    });
    expect(view(run([registered(KEY, 2, 1400)], loaded)).presentation).toBe(
      "dissolve",
    );
  });

  it("allows an explicit ordinary-camera retry when no decoded artwork key exists", () => {
    const noArtwork = run([changed(null, 400)], unavailable());
    expect(noArtwork.matchUnavailable).toBe(false);
    const automatic = ready(run([start({ at: 1000 })], noArtwork), 1100);
    expect(view(automatic).presentation).toBe("illustrated");
    const explicit = ready(
      run([start({ at: 1000, explicitRequest: true })], noArtwork),
      1100,
    );
    expect(view(explicit)).toMatchObject({
      presentation: "live",
      handoffStartedAt: null,
      motionEnabled: true,
    });
  });

  it("requires matching again on automatic context-loss recovery", () => {
    const entered = ready(
      run([start({ at: 1000, explicitRequest: true })], unavailable()),
      1100,
    );
    const lost = run([{ type: "contextLost", epoch: 2, at: 2000 }], entered);
    expect(view(lost)).toMatchObject({
      recoverable: true,
      motionEnabled: true,
    });
    const recovered = ready(run([start({ at: 2600 })], lost), 2700);
    expect(recovered.skipIllustrationMatch).toBe(false);
    expect(view(recovered)).toMatchObject({
      presentation: "illustrated",
      motionEnabled: true,
      revealed: false,
    });
    const matched = run([registered(KEY, 3, 3000)], recovered);
    expect(view(matched).presentation).toBe("dissolve");
    expect(matched.matchUnavailable).toBe(false);
  });

  it("clears mismatch evidence when the artwork changes or the visit ends", () => {
    const changedArtwork = run([changed(NEXT_KEY, 500)], unavailable());
    expect(changedArtwork.matchUnavailable).toBe(false);
    const retry = ready(
      run([start({ at: 1000, explicitRequest: true })], changedArtwork),
      1100,
    );
    expect(view(retry)).toMatchObject({
      presentation: "illustrated",
      motionEnabled: true,
    });
    expect(view(run([registered(NEXT_KEY, 2, 1400)], retry)).presentation).toBe(
      "dissolve",
    );
    const exited = run([{ type: "exit", epoch: 1, at: 500 }], unavailable());
    expect(exited).toMatchObject({
      matchUnavailable: false,
      skipIllustrationMatch: false,
    });
  });

  it.each([
    [{ prefersReducedMotion: true }, "illustrated", "reduced_motion"],
    [{ saveData: true }, "illustrated", "save_data"],
    [{ webglAvailable: false }, "illustrated", "webgl_unavailable"],
  ] as const)(
    "still respects capability and preferences on retry %j",
    (preferences, presentation, reason) => {
      const retry = run(
        [start({ ...preferences, at: 1000, explicitRequest: true })],
        unavailable(),
      );
      expect(view(retry)).toMatchObject({
        presentation,
        ineligibility: reason,
        worldMounted: false,
        revealed: false,
      });
      expect(retry).toMatchObject({
        motionEnabled: true,
        skipIllustrationMatch: false,
      });
    },
  );
});

describe("visitor ownership and renderer replacement", () => {
  it.each([ready, dissolving, travelling, live])(
    "ordinary reader input preserves automatic promotion and the renderer",
    (phase) => {
      const before = phase();
      expect(run([interacted(500)], before)).toBe(before);
      expect(view(before).interactionHeld).toBe(false);
      expect(view(before).worldMounted).toBe(true);
    },
  );

  it("interaction before hydration does not disable automatic entry", () => {
    const state = run([changed(KEY), interacted(), start()]);
    expect(view(state)).toMatchObject({
      presentation: "illustrated",
      illustrationKey: KEY,
      interactionHeld: false,
      worldMounted: true,
    });
  });

  it("reader interaction keeps context-loss recovery available", () => {
    const lost = run([{ type: "contextLost", epoch: 1, at: 1000 }], live());
    const browsing = run([interacted(1100)], lost);
    expect(view(browsing).recoverable).toBe(true);
    const restarted = run([start({ at: 1600 })], browsing);
    expect(view(restarted).worldMounted).toBe(true);
    expect(restarted.contextLossRecoveries).toBe(1);
  });

  it("restarts under a fresh epoch and keeps selected illustration", () => {
    const lost = run([{ type: "contextLost", epoch: 1, at: 1000 }], live());
    const next = run([start({ at: 1600 })], lost);
    expect(next.epoch).toBe(2);
    expect(next.contextLossRecoveries).toBe(1);
    expect(next.illustrationKey).toBe(KEY);
    expect(
      run(
        [
          registered(KEY, 1, 1700),
          arrived(KEY, 1, 1800),
          { type: "contextLost", epoch: 1, at: 1900 },
        ],
        next,
      ),
    ).toBe(next);
  });

  it("explicit retry and room exit retain their ordinary behavior", () => {
    const held = run([interacted(500)], ready());
    const retry = run([start({ at: 1000, explicitRequest: true })], held);
    expect(view(retry)).toMatchObject({
      worldMounted: true,
      interactionHeld: false,
      illustrationKey: KEY,
    });
    const exited = run([{ type: "exit", epoch: 1, at: 1000 }], held);
    expect(view(exited)).toMatchObject({
      presentation: "document",
      interactionHeld: false,
      illustrationKey: null,
    });
  });
});

describe("policy, visibility and diagnostics", () => {
  it("opens an overview automatically only after the renderer is ready", () => {
    const overview = run([
      start(),
      {
        type: "illustrationChanged",
        key: "golf-overview:light",
        matchRequired: false,
        at: 10,
      },
    ]);
    expect(view(overview)).toMatchObject({
      presentation: "illustrated",
      worldMounted: true,
      revealed: false,
    });
    expect(view(ready(overview, 100))).toMatchObject({
      presentation: "live",
      revealed: true,
    });
    const shelf = run(
      [{ type: "illustrationChanged", key: KEY, at: 20 }],
      overview,
    );
    expect(shelf.skipIllustrationMatch).toBe(false);
    expect(view(ready(shelf, 100)).presentation).toBe("illustrated");
  });

  it.each([
    [{ prefersReducedMotion: true }, "illustrated", "reduced_motion"],
    [{ saveData: true }, "illustrated", "save_data"],
    [{ webglAvailable: false }, "illustrated", "webgl_unavailable"],
  ] as const)(
    "preserves capability and preference delivery %j",
    (policy, presentation, reason) => {
      const state = run([start({ ...policy, explicitRequest: true })]);
      expect(view(state)).toMatchObject({
        presentation,
        ineligibility: reason,
        worldMounted: false,
      });
      expect(view(state).canRequest3D).toBe(reason === "webgl_unavailable");
    },
  );

  it("keeps a failed-open document through later starts unless explicitly requested", () => {
    const timeout = run([start({ prepaintTimedOut: true })]);
    expect(view(timeout)).toMatchObject({
      presentation: "document",
      worldMounted: false,
    });
    expect(view(run([start({ at: 1000 })], timeout)).presentation).toBe(
      "document",
    );
    expect(
      view(run([start({ at: 1000, explicitRequest: true })], timeout))
        .presentation,
    ).toBe("illustrated");
  });

  it("also fails open when illustrated hydration never arrives on a browser without WebGL", () => {
    const state = run([
      start({ origin: "prepaint", webglAvailable: false }),
      tick(P.prepaintBackstopMs),
    ]);
    expect(view(state)).toMatchObject({
      presentation: "document",
      failure: "hang",
    });
    expect(
      view(run([start({ webglAvailable: false })], state)).presentation,
    ).toBe("document");
  });

  it("freezes both handoff stages and their clocks while hidden", () => {
    const fade = run(
      [{ type: "visibility", hidden: true, at: 350 }, tick(10000)],
      dissolving(),
    );
    expect(view(fade).presentation).toBe("dissolve");
    const resumed = run(
      [{ type: "visibility", hidden: false, at: 10350 }],
      fade,
    );
    expect(resumed.handoffStartedAt).toBe(10300);
    expect(resumed.deadline?.at).toBe(10480);
    const travel = run([tick(10480)], resumed);
    const hidden = run(
      [{ type: "visibility", hidden: true, at: 10500 }, tick(20000)],
      travel,
    );
    expect(view(hidden).presentation).toBe("travel");
    expect(run([arrived(KEY, 1, 20000)], hidden)).toBe(hidden);
  });

  it("does not start a dissolve in a hidden room even with matching frames", () => {
    const hidden = run(
      [{ type: "visibility", hidden: true, at: 270 }, registered()],
      ready(),
    );
    expect(view(hidden).presentation).toBe("illustrated");
    expect(
      view(run([{ type: "visibility", hidden: false, at: 1000 }], hidden))
        .presentation,
    ).toBe("dissolve");
  });

  it("off-motion reveals the ordinary ready camera without artwork or registration", () => {
    const off = run(
      [{ type: "illustrationMotionChanged", enabled: false, at: 0 }],
      run([start()]),
    );
    expect(view(ready(off))).toMatchObject({
      presentation: "live",
      handoffStartedAt: null,
      motionEnabled: false,
    });
    expect(
      view(
        run(
          [{ type: "illustrationMotionChanged", enabled: false, at: 500 }],
          dissolving(),
        ),
      ).presentation,
    ).toBe("live");
    expect(view(run([start({ at: 1000 })], off)).motionEnabled).toBe(false);
  });

  it("ignores old vignette and registration signals in OG and legacy paths", () => {
    const og = run([start({ ogCapture: true }), changed(KEY)]);
    expect(og.illustratedMode).toBe(false);
    expect(run([registered()], og)).toBe(og);
    expect(
      run([{ type: "bootVignetteCompleted", at: 1 }], og).bootVignetteReady,
    ).toBe(true);
  });
});
