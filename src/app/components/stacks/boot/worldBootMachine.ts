// The homepage boot, reveal, fallback, and cleanup policy as one deterministic
// state machine.
//
// This used to live in six places at once: an inline script in page.tsx, four
// effects and three pieces of React state in StacksHome, module globals in
// loading.ts, an eligibility rule in webglProbe.ts, a MutationObserver in
// BootScreen, and progress reporters inside the WebGL chunk. Every one of them
// held a piece of the answer to "what is the visitor looking at right now",
// and none of them could be tested without a browser.
//
// Everything here is pure. Time arrives as `at` on every event, so the whole
// transition table can be driven with fake clocks. The browser lives in
// worldBootSession.ts; the pre-paint script is generated in
// worldBootPrepaint.ts; React reads the view in useWorldBoot.ts. All three are
// adapters — the policy is here.
//
// Two clocks, deliberately not mixed. `at` is monotonic elapsed milliseconds
// (performance.now()). `warmRecordAgeMs` is a wall-clock age derived from
// Date.now(), because the record it comes from has to survive a reload.
import { WORLD_BOOT_POLICY, type WorldBootPolicy } from "./worldBootPolicy";

/** The value of the document handshake attribute. `pending` hides the flat
 * page and shows the boot screen, `warm` does the same while selecting the
 * shorter cached-world transition, `ready` retires both. Absent means the
 * document is the homepage. */
export type WorldPhase = "pending" | "warm" | "ready";

export type WorldBootStatus =
  /** No capability decision yet. What the server rendered: the flat page. */
  | "unstarted"
  /** This visitor is not getting the world at all — no WebGL, reduced motion,
   * or Save-Data. The flat document is the homepage, not a fallback. */
  | "ineligible"
  /** The boot screen is up and the world is loading behind it. */
  | "booting"
  /** Every reveal gate is open. The world is on screen and the flat document
   * is still mounted underneath for the cross-fade. */
  | "revealing"
  /** The cross-fade finished and the flat document has been retired. */
  | "live"
  /** The world was given up on after it was already promised: a hang, a chunk
   * or scene throw, or a lost GL context. The document comes back. */
  | "failed"
  /** The homepage unmounted. The handshake is cleared so SPA navigation
   * cannot carry the world's overscroll lock onto a document route. */
  | "exited";

/** Which adapter started this boot. The pre-paint script and React answer the
 * warm question from different evidence and arm different backstops. */
export type WorldBootOrigin = "prepaint" | "hydrate";

export type WorldBootFailure = "hang" | "runtimeError" | "contextLost";

export type WorldBootDeadline =
  | "prepaintBackstop"
  | "hangBackstop"
  | "flatRetire";

export type LoadPath = "cold" | "warm";

/** A snapshot of three's DefaultLoadingManager. */
export type AssetLoadState = {
  active: boolean;
  loaded: number;
  total: number;
  errors: number;
};

/** How a start event knows whether this load is warm.
 *
 * The pre-paint script reads the stored record. React does NOT read it again:
 * the script owns the decision (it also weighs reduced motion and Save-Data),
 * and its own backstop can revoke it, so by hydration the document attribute
 * is the more truthful answer. A load slow enough to trip the pre-paint
 * backstop therefore continues as cold, which is what the visitor is actually
 * experiencing. */
export type WarmEvidence =
  | { source: "warmRecord"; ageMs: number | null }
  | { source: "documentPhase"; phase: WorldPhase | null };

export type WorldBootEvent =
  /** Initial capability: WebGL availability, motion preference, Save-Data,
   * warm cache, and whether this is an OG capture. Always legal — a second
   * start is an SPA re-entry and begins a fresh boot. */
  | {
      type: "start";
      at: number;
      origin: WorldBootOrigin;
      webglAvailable: boolean;
      prefersReducedMotion: boolean;
      saveData: boolean;
      ogCapture: boolean;
      warm: WarmEvidence;
    }
  /** A frame has actually been painted by the world's renderer. */
  | { type: "firstFrame"; at: number }
  /** The loading manager published a new state. */
  | { type: "assetLoad"; at: number; assets: AssetLoadState }
  /** The meadow filled its instance buffers, or reported immediately because
   * it is switched off. */
  | { type: "meadowReady"; at: number }
  /** The boot vignette began a fresh item-by-item pass. */
  | { type: "bootVignetteStarted"; at: number }
  /** The boot vignette finished that pass. */
  | { type: "bootVignetteCompleted"; at: number }
  /** The chunk refused to load, or the scene threw during render. */
  | { type: "runtimeError"; at: number }
  /** The GL context was lost. */
  | { type: "contextLost"; at: number }
  /** The homepage unmounted or the route changed. */
  | { type: "exit"; at: number }
  /** Time passed. Fires whichever deadline is due and re-checks the reveal
   * gate; the only event an adapter needs on a timer or a frame loop. */
  | { type: "tick"; at: number };

export type WorldBootState = {
  status: WorldBootStatus;
  origin: WorldBootOrigin | null;
  loadPath: LoadPath;
  ogCapture: boolean;
  failure: WorldBootFailure | null;
  /** A frame has been painted by the renderer. */
  firstFrame: boolean;
  /** When the loading manager last became complete, or null while it is not.
   * The settle window is measured from here. */
  assetsCompleteSince: number | null;
  meadowReady: boolean;
  bootVignetteReady: boolean;
  deadline: { kind: WorldBootDeadline; at: number } | null;
};

/** Everything an adapter needs to know, and nothing about how it renders. */
export type WorldBootView = {
  status: WorldBootStatus;
  /** What the handshake attribute should say. null removes it. */
  documentPhase: WorldPhase | null;
  /** False before the first start: the server rendered the document and no
   * adapter has taken responsibility for the attribute yet. */
  ownsDocument: boolean;
  mode: "flat" | "world";
  loadPath: LoadPath;
  worldMounted: boolean;
  /** The renderer has painted. */
  canvasReady: boolean;
  revealed: boolean;
  /** The flat document is still in the tree (always, until the cross-fade
   * finishes — it is the semantic content, and the crawler's homepage). */
  flatMounted: boolean;
  /** The flat document owns the screen, so its own entrance animations run. */
  flatAnimated: boolean;
  /** The reveal gate is being waited on; an adapter should tick every frame. */
  awaitingReveal: boolean;
  ogCapture: boolean;
  deadlineAt: number | null;
  deadlineKind: WorldBootDeadline | null;
  failure: WorldBootFailure | null;
};

export function initialWorldBootState(): WorldBootState {
  return {
    status: "unstarted",
    origin: null,
    loadPath: "cold",
    ogCapture: false,
    failure: null,
    firstFrame: false,
    assetsCompleteSince: null,
    meadowReady: false,
    bootVignetteReady: false,
    deadline: null,
  };
}

/** The only truthful completion signal from a loading manager: it has loaded
 * every requested item, has no failures, and is no longer active. The progress
 * percentage cannot carry this — drei rebases it for every batch. */
export function assetLoadComplete({
  active,
  loaded,
  total,
  errors,
}: AssetLoadState): boolean {
  return !active && total > 0 && loaded >= total && errors === 0;
}

/** Whether a start event's evidence says this load is warm. */
export function isWarmStart(
  warm: WarmEvidence,
  policy: WorldBootPolicy = WORLD_BOOT_POLICY,
): boolean {
  if (warm.source === "documentPhase") return warm.phase === "warm";
  const { ageMs } = warm;
  return ageMs !== null && ageMs >= 0 && ageMs < policy.warmTtlMs;
}

/** The visitor-policy gate. WebGL is a capability; the other two are choices
 * the visitor has already made, and both mean "give me the document". */
export function worldEligible({
  webglAvailable,
  prefersReducedMotion,
  saveData,
}: {
  webglAvailable: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
}): boolean {
  return webglAvailable && !prefersReducedMotion && !saveData;
}

function assetsReady(
  state: WorldBootState,
  at: number,
  policy: WorldBootPolicy,
): boolean {
  const since = state.assetsCompleteSince;
  return since !== null && at - since >= policy.assetSettleMs;
}

/** Time is never treated as readiness. Every one of these is a fact about the
 * world, and the boot vignette's own pass is one of them so a cached boot
 * still gets one honest item-by-item read instead of an abrupt cut. */
function revealGateOpen(
  state: WorldBootState,
  at: number,
  policy: WorldBootPolicy,
): boolean {
  return (
    state.firstFrame &&
    assetsReady(state, at, policy) &&
    state.meadowReady &&
    state.bootVignetteReady
  );
}

function deadlineDue(
  state: WorldBootState,
  at: number,
): WorldBootDeadline | null {
  if (!state.deadline) return null;
  return at >= state.deadline.at ? state.deadline.kind : null;
}

function giveUp(
  state: WorldBootState,
  failure: WorldBootFailure,
): WorldBootState {
  return { ...state, status: "failed", failure, deadline: null };
}

/** Deadline and reveal arbitration, applied after every event so the machine
 * behaves the same whether an adapter drives it with a timer, a frame loop, or
 * nothing but incoming signals.
 *
 * The reveal is checked before the hang backstop on purpose: an asset that
 * lands in the same millisecond the backstop comes due should reveal the room,
 * not throw it away. */
function settle(
  state: WorldBootState,
  at: number,
  policy: WorldBootPolicy,
): WorldBootState {
  if (state.status === "booting") {
    if (revealGateOpen(state, at, policy)) {
      return {
        ...state,
        status: "revealing",
        deadline: { kind: "flatRetire", at: at + policy.flatRetireMs },
      };
    }
    return deadlineDue(state, at) ? giveUp(state, "hang") : state;
  }
  if (state.status === "revealing" && deadlineDue(state, at) === "flatRetire") {
    return { ...state, status: "live", deadline: null };
  }
  return state;
}

function startDeadline(
  event: Extract<WorldBootEvent, { type: "start" }>,
  policy: WorldBootPolicy,
): WorldBootState["deadline"] {
  if (event.origin === "prepaint") {
    return {
      kind: "prepaintBackstop",
      at: event.at + policy.prepaintBackstopMs,
    };
  }
  // The OG renderer drives a headless capture with its own timeout, and a
  // capture that demoted to the document would silently publish the wrong
  // image. Let it wait.
  if (event.ogCapture) return null;
  return { kind: "hangBackstop", at: event.at + policy.hangBackstopMs };
}

export function reduceWorldBoot(
  state: WorldBootState,
  event: WorldBootEvent,
  policy: WorldBootPolicy = WORLD_BOOT_POLICY,
): WorldBootState {
  // Once the world has been given up on or the route has been left, the
  // signals still arriving from a tearing-down scene describe a world nobody
  // is looking at. Recording them would only churn subscribers.
  if (
    (state.status === "failed" || state.status === "exited") &&
    event.type !== "start" &&
    event.type !== "exit"
  ) {
    return state;
  }

  switch (event.type) {
    case "start": {
      const fresh = initialWorldBootState();
      const base: WorldBootState = {
        ...fresh,
        origin: event.origin,
        ogCapture: event.ogCapture,
        // The vignette runs in the initial entry bundle and starts its pass
        // before the world's own owner exists. Its producer resets it (see
        // `bootVignetteStarted`); a start must not wipe a pass that already
        // completed, or the reveal would wait for a signal nobody will send
        // again and the hang backstop would take the room away.
        bootVignetteReady: state.bootVignetteReady,
      };
      if (
        !worldEligible({
          webglAvailable: event.webglAvailable,
          prefersReducedMotion: event.prefersReducedMotion,
          saveData: event.saveData,
        })
      ) {
        return { ...base, status: "ineligible" };
      }
      return settle(
        {
          ...base,
          status: "booting",
          loadPath: isWarmStart(event.warm, policy) ? "warm" : "cold",
          deadline: startDeadline(event, policy),
        },
        event.at,
        policy,
      );
    }

    case "exit":
      if (state.status === "exited") return state;
      return { ...state, status: "exited", deadline: null };

    case "runtimeError":
      if (state.status === "exited" || state.status === "failed") return state;
      return giveUp(state, "runtimeError");

    case "contextLost":
      if (state.status === "exited" || state.status === "failed") return state;
      return giveUp(state, "contextLost");

    case "firstFrame":
      if (state.firstFrame) return settle(state, event.at, policy);
      return settle({ ...state, firstFrame: true }, event.at, policy);

    case "assetLoad": {
      const complete = assetLoadComplete(event.assets);
      // Monotonic while the manager stays complete: a later batch that starts
      // after an earlier one reached 100% restarts the settle window.
      const since = complete ? (state.assetsCompleteSince ?? event.at) : null;
      if (since === state.assetsCompleteSince) {
        return settle(state, event.at, policy);
      }
      return settle({ ...state, assetsCompleteSince: since }, event.at, policy);
    }

    case "meadowReady":
      if (state.meadowReady) return settle(state, event.at, policy);
      return settle({ ...state, meadowReady: true }, event.at, policy);

    case "bootVignetteStarted":
      if (!state.bootVignetteReady) return settle(state, event.at, policy);
      return settle({ ...state, bootVignetteReady: false }, event.at, policy);

    case "bootVignetteCompleted":
      if (state.bootVignetteReady) return settle(state, event.at, policy);
      return settle({ ...state, bootVignetteReady: true }, event.at, policy);

    case "tick":
      return settle(state, event.at, policy);
  }
}

export function worldBootView(state: WorldBootState): WorldBootView {
  const revealed = state.status === "revealing" || state.status === "live";
  const worldMounted = state.status === "booting" || revealed;
  return {
    status: state.status,
    documentPhase: !worldMounted
      ? null
      : revealed
        ? "ready"
        : state.loadPath === "warm"
          ? "warm"
          : "pending",
    ownsDocument: state.status !== "unstarted",
    mode: worldMounted ? "world" : "flat",
    loadPath: state.loadPath,
    worldMounted,
    canvasReady: state.firstFrame,
    revealed,
    // The flat document is the semantic content and never leaves the tree
    // until the world genuinely owns the screen.
    flatMounted: state.status !== "live",
    flatAnimated: !worldMounted,
    awaitingReveal: state.status === "booting" && state.firstFrame,
    ogCapture: state.ogCapture && state.status !== "exited",
    deadlineAt: state.deadline?.at ?? null,
    deadlineKind: state.deadline?.kind ?? null,
    failure: state.failure,
  };
}

/** Is the boot screen the thing on screen? Answered from the handshake
 * attribute rather than machine state, because the boot vignette ships in the
 * initial entry and may be running before any machine exists. */
export function isBootingPhase(phase: WorldPhase | null): boolean {
  return phase === "pending" || phase === "warm";
}
