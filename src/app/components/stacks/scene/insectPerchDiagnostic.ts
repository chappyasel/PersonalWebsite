import type { CollisionPoint, InsectEnvelope } from "./insectCollision";
import type { InsectPilotPhase } from "./insectPilot";

export type InsectSpecies = "butterfly" | "moth";

export const INSECT_PERCH_REJECTION_CODES = [
  "none",
  "perch-not-found",
  "owner-not-found",
  "owner-empty",
  "no-triangle-surface",
  "no-visible-contact",
  "contact-too-distant",
  "contact-normal-mismatch",
  "occupied",
  "reserved",
  "species-ineligible",
  "unlit-lamp",
  "collision-index-unavailable",
  "support-missing",
  "support-too-narrow",
  "resting-pose-blocked",
  "approach-blocked",
  "hover-blocked",
  "touchdown-blocked",
  "launch-blocked",
  "rejoin-blocked",
  "route-blocked",
  "route-unreachable",
  "stale-collision-revision",
  "automatic-landings-paused",
] as const;

export type InsectPerchRejectionCode =
  (typeof INSECT_PERCH_REJECTION_CODES)[number];

/** `status` remains the reservation verdict. This coarser classification is
 * for diagnostics: an occupied or dark Lamp Perch is temporarily unavailable,
 * not bad authoring or unsafe geometry. */
export type InsectPerchDiagnosticDisposition =
  | "ready"
  | "waiting"
  | "occupied"
  | "rejected";

/**
 * A settled insect is its own disposition rather than a shade of "waiting".
 *
 * Reserving a Perch and standing on one were the same amber, which meant the
 * HUD could not answer the first question anyone asks of it — is anything
 * actually landing? A site held by an insect still two seconds out on its
 * approach looked exactly like a site with a butterfly sitting on it.
 * `reserved` keeps the amber (someone is on their way); `occupied` gets its own
 * colour, and it is the only glyph in the room that means success.
 */
const OCCUPIED_REJECTIONS = new Set<InsectPerchRejectionCode>(["occupied"]);

const TEMPORARY_REJECTIONS = new Set<InsectPerchRejectionCode>([
  "reserved",
  "unlit-lamp",
  "automatic-landings-paused",
  // "The prop is not mounted right now" is a state, not a defect — props load
  // behind Suspense and are re-created outright on a theme flip. Grouping it
  // with the permanent rejections painted a working Perch red for whatever
  // fraction of frames its owner happened to be unmeasurable, which is how the
  // About shelf came to look like a wall of failures it never was.
  "owner-empty",
  // A blocked route is the outcome of ONE attempt, by ONE insect, from wherever
  // that insect happened to be — not a property of the site. Painting it red
  // said "this Perch is broken" when the truth was "a butterfly two metres
  // away, behind a shelf plank, could not find a corridor this time"; and
  // because the verdict was retained until the next attempt on that same
  // Perch, a single awkward approach left a good site red for minutes. That is
  // most of what made the room look like a wall of failures.
  //
  // A site that genuinely cannot be reached still has to surface, so repeated
  // failure with no success in between escalates to `route-unreachable`, which
  // is NOT in this set. The distinction is persistence, not any single verdict.
  "approach-blocked",
  "hover-blocked",
  "touchdown-blocked",
  "launch-blocked",
  "rejoin-blocked",
  "route-blocked",
]);

/**
 * Consecutive failed compilations, with no success in between, before a Perch
 * stops being "an attempt failed" and becomes "nobody can get here".
 *
 * Three rather than one because approaches are planned from the insect's live
 * position: the same site is genuinely blocked from behind a plank and
 * genuinely open from out in front of the shelf, and one sample cannot tell
 * those apart.
 */
export const INSECT_ROUTE_FAILURE_ESCALATION = 3;

/**
 * How long a retained route verdict outlives the attempt that produced it.
 *
 * Route evidence is only meaningful about the moment it was swept. Retaining
 * it indefinitely is what let a Perch that no insect had tried for two minutes
 * keep displaying that stale attempt's verdict.
 */
export const INSECT_ROUTE_FAILURE_TTL_SECONDS = 12;

/**
 * How long a swept route stays DRAWN.
 *
 * Long enough that a plan is visible for the flight it describes, rather than
 * for the single frame between its compilation and the next prop sway.
 */
export const INSECT_ROUTE_DISPLAY_TTL_SECONDS = 6;

export function insectPerchRejectionDisposition(
  rejectionCode: InsectPerchRejectionCode,
): InsectPerchDiagnosticDisposition {
  if (rejectionCode === "none") return "ready";
  if (OCCUPIED_REJECTIONS.has(rejectionCode)) return "occupied";
  return TEMPORARY_REJECTIONS.has(rejectionCode) ? "waiting" : "rejected";
}

export type InsectDiagnosticRoute = Readonly<{
  phase: "approach" | "hover" | "touchdown" | "launch" | "rejoin";
  points: readonly CollisionPoint[];
  clear: boolean;
}>;

export type InsectDiagnosticRouteFailureCode =
  `${InsectDiagnosticRoute["phase"]}-blocked`;

type InsectDiagnosticRoutePublication = Readonly<{
  collisionRevision: number;
  routes: readonly InsectDiagnosticRoute[];
  /** When the compiler swept this route, for the retention TTL. */
  publishedAt: number;
  /** Consecutive failed compilations, reset by any success. */
  failures: number;
}>;

export type InsectDiagnosticRouteState = Readonly<{
  routes: readonly InsectDiagnosticRoute[];
  retainedFailure:
    | InsectDiagnosticRouteFailureCode
    | "route-unreachable"
    | null;
}>;

export type InsectPerchDiagnostic = Readonly<{
  perchId: string;
  unitIndex: number;
  ownerId: string | null;
  occupantId: string | null;
  species: InsectSpecies;
  authoredAnchor: CollisionPoint;
  resolvedContact: CollisionPoint | null;
  normal: CollisionPoint | null;
  tangent: CollisionPoint | null;
  eligibleSpecies: readonly InsectSpecies[];
  envelope: InsectEnvelope;
  routes: readonly InsectDiagnosticRoute[];
  collisionRevision: number | null;
  status: "valid" | "occupied" | "rejected";
  disposition: InsectPerchDiagnosticDisposition;
  rejectionCode: InsectPerchRejectionCode;
  rejectionReason: string;
  /** Collision box that rejected the resting pose, when one did. */
  restingPoseBlockedBy: string | null;
  /** Collision box that refused the most candidate routes on the last failed
   * landing compilation for this Perch. */
  routeBlockedBy: string | null;
  /** Recently-swept route geometry for the overlay to draw. Unlike `routes`,
   * this is not gated on the collision revision — see `routesForDisplay`. */
  displayRoutes: readonly InsectDiagnosticRoute[];
}>;

export type InsectPerchDiagnosticInput = Omit<
  InsectPerchDiagnostic,
  | "status"
  | "disposition"
  | "rejectionCode"
  | "rejectionReason"
  | "restingPoseBlockedBy"
  | "routeBlockedBy"
  | "displayRoutes"
> &
  Readonly<{
    resolutionRejection?: InsectPerchRejectionCode;
    lit?: boolean;
    supportPresent?: boolean;
    restingPoseClear?: boolean;
    restingPoseBlockedBy?: string | null;
    routeBlockedBy?: string | null;
    displayRoutes?: readonly InsectDiagnosticRoute[];
    /** Whether the occupant has actually reached rest, as opposed to holding a
     * reservation while it flies in. */
    occupantAtRest?: boolean;
    plannedCollisionRevision?: number | null;
    retainedRouteFailure?:
      | InsectDiagnosticRouteFailureCode
      | "route-unreachable"
      | null;
    automaticLandingsPaused?: boolean;
  }>;

const REASONS: Record<InsectPerchRejectionCode, string> = {
  none: "Ready",
  "perch-not-found": "The authored Perch is not registered.",
  "owner-not-found": "The named interaction owner is not registered.",
  "owner-empty": "The owner has no visible bounds.",
  "no-triangle-surface": "The owner has no visible triangle-bearing mesh.",
  "no-visible-contact": "No visible mesh contact matched the probe grid.",
  "contact-too-distant":
    "The nearest contact is outside the authored distance tolerance.",
  "contact-normal-mismatch":
    "The contact normal is outside the authored normal tolerance.",
  occupied: "An insect is settled on this Perch.",
  reserved: "An insect has claimed this Perch and is on its way in.",
  "species-ineligible": "This species is not eligible for the Perch.",
  "unlit-lamp": "The Lamp Perch is not currently lit.",
  "collision-index-unavailable": "The Unit collision index is unavailable.",
  "support-missing":
    "The resolved support mesh is absent from the collision index.",
  "support-too-narrow":
    "Legacy platform-width verdict; resolved triangle contacts now provide grip support.",
  "resting-pose-blocked":
    "The complete resting envelope intersects neighboring geometry.",
  "approach-blocked": "Every complete-envelope approach corridor is blocked.",
  "hover-blocked": "The inspection arc is blocked.",
  "touchdown-blocked": "The normal-axis touchdown corridor is blocked.",
  "launch-blocked": "Every outward launch corridor is blocked.",
  "rejoin-blocked": "No collision-safe route rejoin is available.",
  "route-blocked": "The authored cruise loop is blocked.",
  "route-unreachable": `No insect has routed here in ${INSECT_ROUTE_FAILURE_ESCALATION} consecutive attempts.`,
  "stale-collision-revision": "Geometry changed after this plan was compiled.",
  "automatic-landings-paused": "Automatic landings are paused in diagnostics.",
};

/** The single verdict function used by reservation, tests, and development
 * visualization. Inputs are deliberately renderer-agnostic snapshots. */
export function evaluateInsectPerchDiagnostic(
  input: InsectPerchDiagnosticInput,
): InsectPerchDiagnostic {
  let rejection = input.resolutionRejection ?? "none";
  if (rejection === "none" && !input.eligibleSpecies.includes(input.species))
    rejection = "species-ineligible";
  if (rejection === "none" && input.collisionRevision == null)
    rejection = "collision-index-unavailable";
  if (
    rejection === "none" &&
    input.plannedCollisionRevision != null &&
    input.plannedCollisionRevision !== input.collisionRevision
  )
    rejection = "stale-collision-revision";
  if (rejection === "none" && input.supportPresent === false)
    rejection = "support-missing";
  if (rejection === "none" && input.restingPoseClear === false)
    rejection = "resting-pose-blocked";
  if (rejection === "none" && input.retainedRouteFailure)
    rejection = input.retainedRouteFailure;
  if (rejection === "none") {
    const blockedRoute = input.routes.find((route) => !route.clear);
    if (blockedRoute) rejection = `${blockedRoute.phase}-blocked`;
  }
  // Availability is deliberately evaluated after geometry. A dark Lamp or
  // occupied site must not conceal bad contact authoring or a blocked resting
  // envelope in the review HUD.
  if (rejection === "none" && input.lit === false) rejection = "unlit-lamp";
  if (rejection === "none" && input.occupantId)
    rejection = input.occupantAtRest ? "occupied" : "reserved";
  if (rejection === "none" && input.automaticLandingsPaused)
    rejection = "automatic-landings-paused";

  // `status` is the RESERVATION verdict and must not change with the display
  // split: a Perch someone is flying toward is as unavailable as one someone is
  // sitting on.
  const status =
    rejection === "none"
      ? "valid"
      : rejection === "occupied" || rejection === "reserved"
        ? "occupied"
        : "rejected";
  return {
    perchId: input.perchId,
    unitIndex: input.unitIndex,
    ownerId: input.ownerId,
    occupantId: input.occupantId,
    species: input.species,
    authoredAnchor: input.authoredAnchor,
    resolvedContact: input.resolvedContact,
    normal: input.normal,
    tangent: input.tangent,
    eligibleSpecies: input.eligibleSpecies,
    envelope: input.envelope,
    routes: input.routes,
    collisionRevision: input.collisionRevision,
    status,
    disposition: insectPerchRejectionDisposition(rejection),
    rejectionCode: rejection,
    rejectionReason: REASONS[rejection],
    restingPoseBlockedBy: input.restingPoseBlockedBy ?? null,
    routeBlockedBy: input.routeBlockedBy ?? null,
    displayRoutes: input.displayRoutes ?? input.routes,
  };
}

export type InsectPerchDiagnosticSummary = Readonly<{
  total: number;
  ready: number;
  waiting: number;
  /** Perches with an insect actually settled on them. */
  occupied: number;
  rejected: number;
  rejections: readonly Readonly<{
    code: InsectPerchRejectionCode;
    count: number;
  }>[];
}>;

/** Pure HUD summary that keeps expected runtime availability separate from
 * authoring, contact, and collision failures. */
export function summarizeInsectPerchDiagnostics(
  diagnostics: readonly InsectPerchDiagnostic[],
): InsectPerchDiagnosticSummary {
  let ready = 0;
  let waiting = 0;
  let occupied = 0;
  let rejected = 0;
  const rejectionCounts = new Map<InsectPerchRejectionCode, number>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.disposition === "ready") ready += 1;
    else if (diagnostic.disposition === "waiting") waiting += 1;
    else if (diagnostic.disposition === "occupied") occupied += 1;
    else rejected += 1;
    if (diagnostic.rejectionCode !== "none") {
      rejectionCounts.set(
        diagnostic.rejectionCode,
        (rejectionCounts.get(diagnostic.rejectionCode) ?? 0) + 1,
      );
    }
  }
  return {
    total: diagnostics.length,
    ready,
    waiting,
    occupied,
    rejected,
    rejections: [...rejectionCounts]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

/**
 * The Lamp Cone a moth is contained by, flattened for the review overlay.
 *
 * Butterflies had their Flight Volumes drawn from the start and moths had
 * nothing — owner review: "the area they're in doesn't seem represented in the
 * debug". It is published from the frame loop rather than rebuilt in the
 * overlay so the drawn shape is provably the one the moths are actually
 * steered by; a second implementation would be free to drift from it.
 */
export type InsectLampConeOutline = Readonly<{
  lampId: string;
  source: CollisionPoint;
  direction: CollisionPoint;
  nearDistance: number;
  farDistance: number;
  nearRadius: number;
  farRadius: number;
  /** Moths may only land while their lamp is on, so an unlit cone is drawn but
   * dimmed rather than hidden. */
  lit: boolean;
}>;

export type InsectDiagnosticsFilter = "active" | "all";

/** Which half of its Flight Volume a roaming insect is in. */
export type InsectFlightRegion = "front" | "rear" | "none";

export type InsectFlightTelemetry = Readonly<{
  occupantId: string;
  /** Scene clock at publication. The live check needs it to turn a
   * between-sample displacement into a speed. */
  time?: number;
  species?: InsectSpecies;
  /** Residency: the Unit whose air this insect currently belongs to. */
  unitIndex: number;
  /** Where it started. Only interesting as a measure of how far Residency has
   * drifted from the authored arrangement. */
  initialResidency?: number;
  residentIndex: number;
  phase: InsectPilotPhase;
  /** World position at publication. The live check (ADR 0006) needs it: a
   * teleport is a displacement between samples that flight cannot explain, and
   * no per-frame scalar can show one. */
  position?: CollisionPoint;
  /** Where a directed crossing is going, or null for ordinary roaming. */
  transitTo?: number | null;
  /** Scene time of the last legitimate re-home, so the live check can tell one
   * from the bug it is indistinguishable from at a single sample. */
  rehomedAt?: number;
  perchId?: string | null;
  /** The pilot's last rejection code and event. Not an assertion — this is
   * what turns "nobody landed" into a question with an answer. */
  rejectionCode?: InsectPerchRejectionCode;
  event?: string;
  /** Signed distance above the contact plane while perched, else null. A
   * negative value is the one thing a settled insect must never produce. */
  contactGap?: number | null;
  /** The RENDERED body heading about world up, in radians.
   *
   * Not derivable from anything else here: facing is a presentation-layer
   * result — a damped chase of a target that is itself built from velocity —
   * so a complaint about how a landing looks ("spazzing back and forth") was
   * unmeasurable without it. What matters is reversals, not magnitude. */
  yaw?: number;
  region: InsectFlightRegion;
  speed: number;
  /** Height above the meadow ground plane. */
  altitude: number;
  /** Distance-field clearance at the body, in metres. */
  clearance: number;
  /** 0..1 pressure from the Flight Volume boundary. */
  containment: number;
  collisionRevision: number | null;
  lastMeaningfulMovement: number;
  stalled: boolean;
}>;

export type InsectFlightStatePublication = Readonly<{
  telemetry: InsectFlightTelemetry;
  /** Recent world positions, oldest first. Roaming is now judged on whether
   * residents share lines through the air, which no per-frame number can
   * show and a drawn trail shows immediately. */
  trail: readonly CollisionPoint[];
}>;

/**
 * The population's own view of itself: where the camera is, how many residents
 * each Unit should hold, and how many it does.
 *
 * Published because the distribution is the whole point of ADR 0004 and no
 * per-insect number can show it. It is also the first thing to look at when
 * the room feels lopsided — a demand curve centred somewhere the camera is not
 * is a very different bug from residents that will not cross.
 */
export type InsectResidencySnapshot = Readonly<{
  cameraX: number;
  rehomingMargin: number;
  demand: readonly number[];
  residents: readonly number[];
  transits: readonly (number | null)[];
}>;

export type InsectDiagnosticsSnapshot = Readonly<{
  residency: InsectResidencySnapshot | null;
  filter: InsectDiagnosticsFilter;
  showEnvelopes: boolean;
  showRoutes: boolean;
  showFlightVolumes: boolean;
  showFlightTrails: boolean;
  /**
   * The moth overlays, on their own switches.
   *
   * Butterflies and moths never share the screen — one is a daylight animal and
   * the other only exists once the lamps are lit — so a single pair of toggles
   * meant turning on the overlay for the species you were looking at and the
   * one you were not. Owner review: "the two debug UIs should be split /
   * conditional".
   */
  showLampCones: boolean;
  showMothTrails: boolean;
  pauseAutomaticLandings: boolean;
  hoveredPerchId: string | null;
  forceRequest: number;
  forceResult: string | null;
  diagnostics: readonly InsectPerchDiagnostic[];
  flightStates: readonly InsectFlightStatePublication[];
  lampCones: readonly InsectLampConeOutline[];
}>;

type Listener = () => void;

/** Small external store shared by the DOM HUD and the R3F diagnostic layer.
 * It is inert in production because neither development component mounts. */
export class InsectDiagnosticsController {
  private listeners = new Set<Listener>();
  private routes = new Map<string, InsectDiagnosticRoutePublication>();
  /** Survives the `clearRoutes` at the head of each compilation, so escalation
   * can count attempts rather than publications. */
  private routeFailures = new Map<string, number>();
  private routeBlockers = new Map<string, string>();
  private flightStates = new Map<string, InsectFlightStatePublication>();
  private snapshot: InsectDiagnosticsSnapshot = {
    residency: null,
    lampCones: [],
    filter: "active",
    showEnvelopes: false,
    showRoutes: false,
    showFlightVolumes: false,
    showFlightTrails: false,
    showLampCones: false,
    showMothTrails: false,
    pauseAutomaticLandings: false,
    hoveredPerchId: null,
    forceRequest: 0,
    forceResult: null,
    diagnostics: [],
    flightStates: [],
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  update(update: Partial<InsectDiagnosticsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }

  forceLandingAttempt() {
    this.update({
      forceRequest: this.snapshot.forceRequest + 1,
      forceResult: "Attempt queued",
    });
  }

  /** Publish the routes produced by the real Landing Plan compiler. They are
   * only meaningful against the exact collision snapshot that was swept. */
  publishRoutes(
    perchId: string,
    collisionRevision: number,
    routes: readonly InsectDiagnosticRoute[],
    now = 0,
  ) {
    // `clearRoutes` runs at the top of every compilation, so the running count
    // is carried on the controller rather than in the publication it deletes.
    const failed = routes.some((route) => !route.clear);
    const previous = this.routeFailures.get(perchId) ?? 0;
    const failures = failed ? previous + 1 : 0;
    if (failures) this.routeFailures.set(perchId, failures);
    else this.routeFailures.delete(perchId);
    this.routes.set(perchId, {
      collisionRevision,
      routes,
      publishedAt: now,
      failures,
    });
  }

  /** Read routes for evaluation, not as a renderer-side overlay. A collision
   * revision mismatch invalidates and forgets the old plan immediately. */
  routesForCollisionRevision(
    perchId: string,
    collisionRevision: number | null,
  ): readonly InsectDiagnosticRoute[] {
    const publication = this.routes.get(perchId);
    if (!publication) return [];
    if (
      collisionRevision == null ||
      publication.collisionRevision !== collisionRevision
    ) {
      this.routes.delete(perchId);
      return [];
    }
    return publication.routes;
  }

  /** Route evidence plus the revision of a stale failed compilation, when
   * present. The diagnostic evaluator uses this richer seam; renderers only
   * consume current-revision route geometry. */
  diagnosticRouteStateForCollisionRevision(
    perchId: string,
    collisionRevision: number | null,
    now = 0,
  ): InsectDiagnosticRouteState {
    const publication = this.routes.get(perchId);
    if (!publication) return { routes: [], retainedFailure: null };
    if (
      collisionRevision != null &&
      publication.collisionRevision === collisionRevision
    ) {
      // Escalation is a property of the site's history, so it applies to a
      // current-revision verdict exactly as it does to a retained one.
      // Deciding it only on the stale path would have made the same evidence
      // read amber or red depending on which side of a collision refresh the
      // HUD sampled it.
      const persistent =
        publication.failures >= INSECT_ROUTE_FAILURE_ESCALATION &&
        publication.routes.some((route) => !route.clear);
      return {
        routes: publication.routes,
        retainedFailure: persistent ? "route-unreachable" : null,
      };
    }

    // A successful plan becoming stale does not make the independently
    // validated Perch unsafe. A failed plan, however, must not flash ready in
    // the gap between an animated Unit revision and the next synchronous
    // compiler publication. Retain only its stable rejection code; stale
    // route geometry is never exposed or rendered. `clearRoutes` starts every
    // compiler attempt, so changed geometry can still prove the site ready.
    const blockedRoute = publication.routes.find((route) => !route.clear);
    if (blockedRoute) {
      // Route evidence describes the moment it was swept. Past its TTL it is
      // not evidence about anything, so it is forgotten rather than displayed:
      // a Perch nobody has attempted for a while reads as ready, which is the
      // honest answer to "is this site usable".
      if (now - publication.publishedAt > INSECT_ROUTE_FAILURE_TTL_SECONDS) {
        this.routes.delete(perchId);
        return { routes: [], retainedFailure: null };
      }
      return {
        routes: [],
        retainedFailure:
          publication.failures >= INSECT_ROUTE_FAILURE_ESCALATION
            ? "route-unreachable"
            : `${blockedRoute.phase}-blocked`,
      };
    }
    this.routes.delete(perchId);
    return {
      routes: [],
      retainedFailure: null,
    };
  }

  clearRoutes(perchId: string) {
    this.routes.delete(perchId);
  }

  /**
   * Route geometry for DRAWING, which is a different question from route
   * geometry for judging.
   *
   * The verdict path drops a plan the instant the collision revision moves,
   * and the revision moves whenever any prop sways — so the drawn route
   * appeared for the frame after each compilation and then vanished, which is
   * the flashing. A path swept two seconds ago is worthless as evidence and
   * perfectly good as a picture of where the insect is going, so this ignores
   * the revision and only asks how old the sweep is.
   */
  routesForDisplay(
    perchId: string,
    now: number,
  ): readonly InsectDiagnosticRoute[] {
    const publication = this.routes.get(perchId);
    if (!publication) return [];
    if (now - publication.publishedAt > INSECT_ROUTE_DISPLAY_TTL_SECONDS)
      return [];
    return publication.routes;
  }

  /** The collider that refused the most candidate routes on the last failed
   * compilation. Development only; overwritten by the next attempt. */
  publishRouteBlocker(perchId: string, boxId: string | null) {
    if (boxId) this.routeBlockers.set(perchId, boxId);
    else this.routeBlockers.delete(perchId);
  }

  routeBlocker(perchId: string): string | null {
    return this.routeBlockers.get(perchId) ?? null;
  }

  /** The flight phase of a named occupant, for telling a Perch that is being
   * flown toward from one that is being stood on. */
  occupantPhase(occupantId: string | null): InsectPilotPhase | null {
    if (!occupantId) return null;
    return this.flightStates.get(occupantId)?.telemetry.phase ?? null;
  }

  /** Replace the drawn Lamp Cones. Called at the diagnostics publish cadence,
   * not per frame. */
  publishLampCones(lampCones: readonly InsectLampConeOutline[]) {
    this.update({ lampCones });
  }

  publishResidency(residency: InsectResidencySnapshot) {
    this.update({ residency });
  }

  publishFlightState(publication: InsectFlightStatePublication) {
    this.flightStates.set(publication.telemetry.occupantId, publication);
    this.update({ flightStates: [...this.flightStates.values()] });
  }

  clearFlightStates() {
    this.flightStates.clear();
    this.update({ flightStates: [] });
  }

  /**
   * Forget published flight state, optionally for ONE species.
   *
   * The scope is the whole point. Butterflies and moths are alive at opposite
   * times of day and publish into one map, so an unscoped clear is a component
   * deleting a sibling's telemetry: the butterflies hide at dusk and used to
   * wipe every frame, while a moth republishes only every 0.25 s — so a moth
   * trail existed from its publish until the next butterfly frame and no
   * longer. Owner review: "moth flight trails are still flashing like 2 times
   * per second". The mirror image is daylight, where the moths stop publishing
   * and nobody clears them, leaving the last trail frozen on screen: "stays
   * persistent in light mode which is wrong".
   *
   * Each species now clears only its own, which fixes both.
   */
  clearFlightTelemetry(species?: InsectSpecies) {
    if (!this.flightStates.size) return;
    if (!species) {
      this.flightStates.clear();
      this.update({ flightStates: [] });
      return;
    }
    let removed = false;
    // Telemetry published before `species` existed is a butterfly's.
    for (const [occupantId, publication] of this.flightStates)
      if ((publication.telemetry.species ?? "butterfly") === species) {
        this.flightStates.delete(occupantId);
        removed = true;
      }
    if (removed) this.update({ flightStates: [...this.flightStates.values()] });
  }

  /** Whether any state is published for a species, so a caller can skip the
   * clear entirely rather than rebuilding the array to remove nothing. */
  hasFlightTelemetry(species: InsectSpecies) {
    for (const publication of this.flightStates.values())
      if ((publication.telemetry.species ?? "butterfly") === species)
        return true;
    return false;
  }
}

export const insectDiagnosticsController = new InsectDiagnosticsController();

export function insectDiagnosticsEnabled(environment: string) {
  return environment === "development";
}
