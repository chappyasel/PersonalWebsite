// Every constant the homepage boot handshake depends on, in one serializable
// record.
//
// Two very different runtimes have to agree on these values: an inline script
// that runs while the document is still parsing, and the React tree that takes
// the handshake over a second or two later. The script cannot import anything,
// so the only way to keep the two honest is to GENERATE the script from this
// record (see worldBootPrepaint.ts) instead of retyping "20000" and
// "data-world" in a template literal.
//
// Keep it JSON-serializable. The moment a function or a Symbol lands here the
// generated script stops being derivable from it.
import { SCENE_WEBGL_CAPABILITY_SESSION_KEY } from "../scene/sceneVisitStorage";

export type WorldBootPolicy = {
  /** The document-level handshake attribute. `src/styles/globals.css` selects
   * on this literal during the first paint, so a change here is a change
   * there. */
  worldAttribute: string;
  /** Marks the automated OG capture, which renders the live scene with the
   * homepage chrome hidden. */
  ogCaptureAttribute: string;
  /** Query parameter the OG renderer appends. */
  ogCaptureParam: string;
  /** Debug-only query parameter that keeps the authored boot screen visible
   * after the world is ready, so its delayed presentation can be inspected. */
  holdBootParam: string;
  /** Media query for the visitor's motion preference. Evaluated on every
   * document load — it is a live choice, never cached. */
  reducedMotionQuery: string;
  /** sessionStorage key holding the cached WebGL capability answer. Cached
   * per tab because it answers "can this browser run it", which cannot change
   * mid-session. */
  webglCapabilityKey: string;
  /** localStorage key holding `{ t: <epoch ms of last successful reveal> }`.
   * Per profile, not per tab, because the HTTP cache it predicts is shared
   * across tabs. */
  warmKey: string;
  /** How long one successful reveal may predict the next. Long enough for
   * visit-and-come-back-tomorrow, short enough that an evicted HTTP cache
   * cannot keep claiming warmth for weeks. */
  warmTtlMs: number;
  /** Fail-open backstop owned by the pre-paint script. If the JS bundle never
   * boots, the flat document is hidden behind a loading screen nothing will
   * ever retire, so the script retires it itself. */
  prepaintBackstopMs: number;
  /** Fail-open backstop owned by React, once React exists. Long enough that
   * no real network trips it, short enough that a wedged tab still gets a
   * readable page. */
  hangBackstopMs: number;
  /** Quiet window an idle loading manager must hold before its completion is
   * believed. Closes the gap between one batch finishing and a Suspense child
   * queueing the next. */
  assetSettleMs: number;
  /** Ceiling on how long a ready room may be held back by the boot vignette's
   * closing glide. The glide is a 600ms CSS transition
   * (`ABOUT_BOOT_STAGE_GLIDE`), so this is roughly twice the honest cost. It
   * exists because the vignette is presentation and presentation must never be
   * able to strand a world that has already painted: without it a transition
   * that never settles turns a cosmetic bug into a hang, and the only way out
   * is `hangBackstopMs` demoting a perfectly good world to the flat page. */
  vignetteCeilingMs: number;
  /** How long the flat document stays mounted behind the revealed world so
   * the curtain can cross-fade over it. Matches the 360ms opacity transition
   * in globals.css plus a frame of slack. */
  flatRetireMs: number;
  /** Window globals the pre-paint script uses to hand its backstop timer to
   * React. Named here so the script and the React adapter cannot drift. */
  prepaintTimerGlobal: string;
  prepaintTokenGlobal: string;
  /** Monotonic start handed to analytics once hydration takes ownership. */
  prepaintStartedAtGlobal: string;
  /** Where the pre-paint backstop records that it fired, so hydration can
   * find out. Without it, React arrives after the twenty-second fail-open,
   * sees a bare document, and starts a second forty-second wait on top of the
   * one the visitor already sat through. */
  prepaintOutcomeGlobal: string;
};

export const WORLD_BOOT_POLICY: WorldBootPolicy = {
  worldAttribute: "data-world",
  ogCaptureAttribute: "data-og-capture",
  ogCaptureParam: "og-capture",
  holdBootParam: "hold-boot",
  reducedMotionQuery: "(prefers-reduced-motion: reduce)",
  webglCapabilityKey: SCENE_WEBGL_CAPABILITY_SESSION_KEY,
  warmKey: "stacks-warm",
  warmTtlMs: 3 * 24 * 60 * 60 * 1000,
  prepaintBackstopMs: 20000,
  hangBackstopMs: 40000,
  assetSettleMs: 250,
  vignetteCeilingMs: 1200,
  flatRetireMs: 420,
  prepaintTimerGlobal: "__stacksWorldBootTimer",
  prepaintTokenGlobal: "__stacksWorldBootToken",
  prepaintStartedAtGlobal: "__stacksWorldBootStartedAt",
  prepaintOutcomeGlobal: "__stacksWorldBootOutcome",
};

/** Key for the warm-boot record. Re-exported under its historical name so the
 * first-visit reset can keep listing the storage it owns. */
export const WARM_KEY = WORLD_BOOT_POLICY.warmKey;
