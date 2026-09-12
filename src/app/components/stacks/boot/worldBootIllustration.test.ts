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
        worldMounted: false,
        handoffStartedAt: null,
      });
      expect(run([registered(), arrived(), tick(10000)], state)).toBe(state);
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
});

describe("visitor ownership and renderer replacement", () => {
  it.each([ready, dissolving, travelling])(
    "reading cancels pending promotion and ignores teardown signals",
    (phase) => {
      const held = run([interacted(500)], phase());
      expect(view(held)).toMatchObject({
        status: "illustrated",
        presentation: "illustrated",
        interactionHeld: true,
        worldMounted: false,
        canRequest3D: true,
        recoverable: false,
      });
      const late = run(
        [
          registered(),
          arrived(),
          { type: "contextLost", epoch: 1, at: 1000 },
          { type: "firstFrame", epoch: 1, at: 1000 },
        ],
        held,
      );
      expect(late).toBe(held);
      expect(view(run([start({ at: 2000 })], held)).worldMounted).toBe(false);
    },
  );

  it("preserves interaction before hydration starts", () => {
    const state = run([changed(KEY), interacted(), start()]);
    expect(view(state)).toMatchObject({
      presentation: "illustrated",
      illustrationKey: KEY,
      interactionHeld: true,
      worldMounted: false,
    });
  });

  it("records live interaction without taking away the live room", () => {
    const held = run([interacted(900)], live());
    expect(view(held)).toMatchObject({
      presentation: "live",
      interactionHeld: true,
      worldMounted: true,
    });
    const lost = run([{ type: "contextLost", epoch: 1, at: 1000 }], held);
    expect(view(lost)).toMatchObject({
      presentation: "illustrated",
      illustrationKey: KEY,
      recoverable: false,
      worldMounted: false,
    });
    expect(view(run([start({ at: 2000 })], lost)).interactionHeld).toBe(true);
  });

  it("accepts reader ownership after context loss, before a queued retry", () => {
    const lost = run([{ type: "contextLost", epoch: 1, at: 1000 }], live());
    expect(view(lost).recoverable).toBe(true);
    const held = run([interacted(1100)], lost);
    expect(view(held)).toMatchObject({
      recoverable: false,
      interactionHeld: true,
    });
    const restarted = run([start({ at: 1600 })], held);
    expect(view(restarted).worldMounted).toBe(false);
    expect(restarted.contextLossRecoveries).toBe(0);
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

  it("only an explicit retry or a true exit releases a reader hold", () => {
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
  it.each([
    [{ prefersReducedMotion: true }, "document", "reduced_motion"],
    [{ saveData: true }, "document", "save_data"],
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
