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
  "stale-collision-revision",
  "automatic-landings-paused",
] as const;

export type InsectPerchRejectionCode =
  (typeof INSECT_PERCH_REJECTION_CODES)[number];

/** `status` remains the reservation verdict. This coarser classification is
 * for diagnostics: an occupied or dark Lamp Perch is temporarily unavailable,
 * not bad authoring or unsafe geometry. */
export type InsectPerchDiagnosticDisposition = "ready" | "waiting" | "rejected";

const TEMPORARY_REJECTIONS = new Set<InsectPerchRejectionCode>([
  "occupied",
  "unlit-lamp",
  "automatic-landings-paused",
]);

export function insectPerchRejectionDisposition(
  rejectionCode: InsectPerchRejectionCode,
): InsectPerchDiagnosticDisposition {
  if (rejectionCode === "none") return "ready";
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
}>;

export type InsectDiagnosticRouteState = Readonly<{
  routes: readonly InsectDiagnosticRoute[];
  retainedFailure: InsectDiagnosticRouteFailureCode | null;
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
}>;

export type InsectPerchDiagnosticInput = Omit<
  InsectPerchDiagnostic,
  "status" | "disposition" | "rejectionCode" | "rejectionReason"
> &
  Readonly<{
    resolutionRejection?: InsectPerchRejectionCode;
    lit?: boolean;
    supportPresent?: boolean;
    restingPoseClear?: boolean;
    plannedCollisionRevision?: number | null;
    retainedRouteFailure?: InsectDiagnosticRouteFailureCode | null;
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
  occupied: "Another insect occupies this Perch.",
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
  if (rejection === "none" && input.occupantId) rejection = "occupied";
  if (rejection === "none" && input.automaticLandingsPaused)
    rejection = "automatic-landings-paused";

  const status =
    rejection === "none"
      ? "valid"
      : rejection === "occupied"
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
  };
}

export type InsectPerchDiagnosticSummary = Readonly<{
  total: number;
  ready: number;
  waiting: number;
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
  let rejected = 0;
  const rejectionCounts = new Map<InsectPerchRejectionCode, number>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.disposition === "ready") ready += 1;
    else if (diagnostic.disposition === "waiting") waiting += 1;
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
    rejected,
    rejections: [...rejectionCounts]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

export type InsectDiagnosticsFilter = "active" | "all";

/** Which half of its Flight Volume a roaming insect is in. */
export type InsectFlightRegion = "front" | "rear" | "none";

export type InsectFlightTelemetry = Readonly<{
  occupantId: string;
  /** Residency: the Unit whose air this insect currently belongs to. */
  unitIndex: number;
  /** Where it started. Only interesting as a measure of how far Residency has
   * drifted from the authored arrangement. */
  homeUnit?: number;
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
  /** Signed distance above the contact plane while perched, else null. A
   * negative value is the one thing a settled insect must never produce. */
  contactGap?: number | null;
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

export type InsectDiagnosticsSnapshot = Readonly<{
  filter: InsectDiagnosticsFilter;
  showEnvelopes: boolean;
  showRoutes: boolean;
  showFlightVolumes: boolean;
  showFlightTrails: boolean;
  pauseAutomaticLandings: boolean;
  hoveredPerchId: string | null;
  forceRequest: number;
  forceResult: string | null;
  diagnostics: readonly InsectPerchDiagnostic[];
  flightStates: readonly InsectFlightStatePublication[];
}>;

type Listener = () => void;

/** Small external store shared by the DOM HUD and the R3F diagnostic layer.
 * It is inert in production because neither development component mounts. */
export class InsectDiagnosticsController {
  private listeners = new Set<Listener>();
  private routes = new Map<string, InsectDiagnosticRoutePublication>();
  private flightStates = new Map<string, InsectFlightStatePublication>();
  private snapshot: InsectDiagnosticsSnapshot = {
    filter: "active",
    showEnvelopes: false,
    showRoutes: false,
    showFlightVolumes: false,
    showFlightTrails: false,
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
  ) {
    this.routes.set(perchId, { collisionRevision, routes });
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
  ): InsectDiagnosticRouteState {
    const publication = this.routes.get(perchId);
    if (!publication) return { routes: [], retainedFailure: null };
    if (
      collisionRevision != null &&
      publication.collisionRevision === collisionRevision
    )
      return { routes: publication.routes, retainedFailure: null };

    // A successful plan becoming stale does not make the independently
    // validated Perch unsafe. A failed plan, however, must not flash ready in
    // the gap between an animated Unit revision and the next synchronous
    // compiler publication. Retain only its stable rejection code; stale
    // route geometry is never exposed or rendered. `clearRoutes` starts every
    // compiler attempt, so changed geometry can still prove the site ready.
    const blockedRoute = publication.routes.find((route) => !route.clear);
    if (blockedRoute)
      return {
        routes: [],
        retainedFailure: `${blockedRoute.phase}-blocked`,
      };
    this.routes.delete(perchId);
    return {
      routes: [],
      retainedFailure: null,
    };
  }

  clearRoutes(perchId: string) {
    this.routes.delete(perchId);
  }

  publishFlightState(publication: InsectFlightStatePublication) {
    this.flightStates.set(publication.telemetry.occupantId, publication);
    this.update({ flightStates: [...this.flightStates.values()] });
  }

  clearFlightStates() {
    this.flightStates.clear();
    this.update({ flightStates: [] });
  }

  clearFlightTelemetry() {
    if (!this.flightStates.size) return;
    this.flightStates.clear();
    this.update({ flightStates: [] });
  }
}

export const insectDiagnosticsController = new InsectDiagnosticsController();

export function insectDiagnosticsEnabled(environment: string) {
  return environment === "development";
}
