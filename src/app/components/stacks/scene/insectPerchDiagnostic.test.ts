import { describe, expect, it } from "vitest";

import {
  INSECT_ENVELOPES,
  reviseInsectCollisionIndex,
} from "./insectCollision";
import {
  INSECT_PERCH_REJECTION_CODES,
  INSECT_ROUTE_FAILURE_ESCALATION,
  INSECT_ROUTE_FAILURE_TTL_SECONDS,
  InsectDiagnosticsController,
  evaluateInsectPerchDiagnostic,
  insectDiagnosticsEnabled,
  summarizeInsectPerchDiagnostics,
} from "./insectPerchDiagnostic";

const base = {
  perchId: "about:test",
  unitIndex: 0,
  ownerId: "test:owner",
  occupantId: null,
  species: "butterfly" as const,
  authoredAnchor: { x: 0, y: 1, z: 0 },
  resolvedContact: { x: 0, y: 0.9, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  tangent: { x: 0, y: 0, z: 1 },
  eligibleSpecies: ["butterfly"] as const,
  envelope: INSECT_ENVELOPES.butterfly,
  routes: [],
  collisionRevision: 4,
  supportPresent: true,
  restingPoseClear: true,
};

describe("shared insect Perch diagnostics", () => {
  it("returns one stable, exact rejection code", () => {
    const diagnostic = evaluateInsectPerchDiagnostic({
      ...base,
      supportPresent: false,
    });
    expect(INSECT_PERCH_REJECTION_CODES).toContain(diagnostic.rejectionCode);
    expect(diagnostic).toMatchObject({
      status: "rejected",
      disposition: "rejected",
      rejectionCode: "support-missing",
    });
  });

  it("separates temporary availability from authoring and safety rejection", () => {
    const ready = evaluateInsectPerchDiagnostic(base);
    const unlit = evaluateInsectPerchDiagnostic({ ...base, lit: false });
    const occupied = evaluateInsectPerchDiagnostic({
      ...base,
      occupantId: "butterfly:2",
    });
    const unsafe = evaluateInsectPerchDiagnostic({
      ...base,
      restingPoseClear: false,
    });

    expect(unlit.disposition).toBe("waiting");
    // Reserved but still inbound: amber, like any other "not right now".
    expect(occupied.disposition).toBe("waiting");
    expect(occupied.rejectionCode).toBe("reserved");
    // Actually stood on: its own disposition, because it is the one state that
    // means a landing succeeded.
    const settled = evaluateInsectPerchDiagnostic({
      ...base,
      occupantId: "butterfly:2",
      occupantAtRest: true,
    });
    expect(settled.disposition).toBe("occupied");
    expect(settled.rejectionCode).toBe("occupied");
    // Both are equally unavailable to a second insect.
    expect(occupied.status).toBe("occupied");
    expect(settled.status).toBe("occupied");
    expect(unsafe.disposition).toBe("rejected");
    expect(
      evaluateInsectPerchDiagnostic({
        ...base,
        lit: false,
        supportPresent: false,
      }).rejectionCode,
    ).toBe("support-missing");
    expect(
      summarizeInsectPerchDiagnostics([ready, unlit, occupied, unsafe]),
    ).toEqual({
      total: 4,
      ready: 1,
      waiting: 2,
      occupied: 0,
      rejected: 1,
      rejections: [
        { code: "reserved", count: 1 },
        { code: "resting-pose-blocked", count: 1 },
        { code: "unlit-lamp", count: 1 },
      ],
    });
  });

  it("rejects species, occupancy, stale geometry, and blocked route centrally", () => {
    expect(
      evaluateInsectPerchDiagnostic({
        ...base,
        species: "moth",
        envelope: INSECT_ENVELOPES.moth,
      }).rejectionCode,
    ).toBe("species-ineligible");
    expect(
      evaluateInsectPerchDiagnostic({ ...base, occupantId: "butterfly:2" })
        .rejectionCode,
    ).toBe("reserved");
    expect(
      evaluateInsectPerchDiagnostic({
        ...base,
        occupantId: "butterfly:2",
        occupantAtRest: true,
      }).rejectionCode,
    ).toBe("occupied");
    expect(
      evaluateInsectPerchDiagnostic({ ...base, plannedCollisionRevision: 3 })
        .rejectionCode,
    ).toBe("stale-collision-revision");
    expect(
      evaluateInsectPerchDiagnostic({
        ...base,
        routes: [{ phase: "launch", points: [], clear: false }],
      }).rejectionCode,
    ).toBe("launch-blocked");
    expect(
      evaluateInsectPerchDiagnostic({ ...base, lit: false }).rejectionCode,
    ).toBe("unlit-lamp");
    expect(
      evaluateInsectPerchDiagnostic({
        ...base,
        automaticLandingsPaused: true,
      }).rejectionCode,
    ).toBe("automatic-landings-paused");
  });

  it("omits diagnostics from production", () => {
    expect(insectDiagnosticsEnabled("development")).toBe(true);
    expect(insectDiagnosticsEnabled("production")).toBe(false);
  });

  it("feeds only current-revision Landing Plan routes through the evaluator", () => {
    const controller = new InsectDiagnosticsController();
    const blockedHover = [
      { phase: "hover" as const, points: [], clear: false },
    ];
    controller.publishRoutes("about:test", 4, blockedHover);

    const routes = controller.routesForCollisionRevision("about:test", 4);
    expect(routes).toBe(blockedHover);
    expect(
      evaluateInsectPerchDiagnostic({ ...base, routes }).rejectionCode,
    ).toBe("hover-blocked");
  });

  it("omits and clears routes compiled against stale geometry", () => {
    const controller = new InsectDiagnosticsController();
    controller.publishRoutes("about:test", 3, [
      { phase: "approach", points: [], clear: false },
    ]);

    expect(controller.routesForCollisionRevision("about:test", 4)).toEqual([]);
    expect(controller.routesForCollisionRevision("about:test", 3)).toEqual([]);
  });

  it("does not attach plan routes after a diagnostic was evaluated", () => {
    const controller = new InsectDiagnosticsController();
    const diagnostic = evaluateInsectPerchDiagnostic(base);
    controller.publishRoutes("about:test", 4, [
      { phase: "launch", points: [], clear: false },
    ]);
    controller.update({ diagnostics: [diagnostic] });

    expect(controller.getSnapshot().diagnostics[0]?.routes).toEqual([]);
  });

  it("never flashes an unchanged failed Perch ready across 100 animated collision refreshes", () => {
    const controller = new InsectDiagnosticsController();
    const blockedHover = [
      { phase: "hover" as const, points: [], clear: false },
    ];
    let collision = reviseInsectCollisionIndex(null, [
      {
        id: "animated-decoration",
        min: { x: -0.2, y: 0, z: -0.2 },
        max: { x: 0.2, y: 0.4, z: 0.2 },
      },
    ]);
    controller.publishRoutes("about:test", collision.revision, blockedHover);
    const dispositions: string[] = [];
    const rejectionCodes: string[] = [];
    const revisions = new Set<number>();

    for (let refresh = 1; refresh <= 100; refresh++) {
      // The decoration moves continuously, so the Unit-wide collision
      // revision is correctly new even though this Perch remains blocked for
      // the same semantic reason throughout the observation window.
      const drift = refresh * 0.0005;
      collision = reviseInsectCollisionIndex(collision, [
        {
          id: "animated-decoration",
          min: { x: -0.2 + drift, y: 0, z: -0.2 },
          max: { x: 0.2 + drift, y: 0.4, z: 0.2 },
        },
      ]);
      revisions.add(collision.revision);
      const before = controller.diagnosticRouteStateForCollisionRevision(
        "about:test",
        collision.revision,
      );
      const beforeDiagnostic = evaluateInsectPerchDiagnostic({
        ...base,
        collisionRevision: collision.revision,
        routes: before.routes,
        retainedRouteFailure: before.retainedFailure,
      });
      dispositions.push(beforeDiagnostic.disposition);
      rejectionCodes.push(beforeDiagnostic.rejectionCode);

      // Model the synchronous compiler publication following the diagnostic
      // preflight. Both samples describe the same blocked Perch; neither is
      // allowed to appear ready in the shared HUD snapshot.
      controller.clearRoutes("about:test");
      controller.publishRoutes("about:test", collision.revision, blockedHover);
      const after = controller.diagnosticRouteStateForCollisionRevision(
        "about:test",
        collision.revision,
      );
      const afterDiagnostic = evaluateInsectPerchDiagnostic({
        ...base,
        collisionRevision: collision.revision,
        routes: after.routes,
        retainedRouteFailure: after.retainedFailure,
      });
      dispositions.push(afterDiagnostic.disposition);
      rejectionCodes.push(afterDiagnostic.rejectionCode);
    }

    // The invariant this test exists for is that a blocked Perch never reads
    // ready between an animated revision and the next publication. Which shade
    // of not-ready it reads is a separate decision: a single blocked attempt is
    // "waiting", and only repeated failure escalates to a red site verdict.
    expect(dispositions).not.toContain("ready");
    expect(new Set(rejectionCodes)).toEqual(
      new Set(["hover-blocked", "route-unreachable"]),
    );
    // Escalation must actually engage rather than leaving a permanently
    // unroutable site amber forever.
    expect(rejectionCodes[rejectionCodes.length - 1]).toBe("route-unreachable");
    expect(revisions.size).toBe(100);
  });

  it("forgets a route verdict once it is older than the retention window", () => {
    const controller = new InsectDiagnosticsController();
    controller.publishRoutes(
      "about:test",
      4,
      [{ phase: "launch", points: [], clear: false }],
      100,
    );
    // Still inside the window: the verdict describes a recent sweep.
    expect(
      controller.diagnosticRouteStateForCollisionRevision(
        "about:test",
        5,
        100 + INSECT_ROUTE_FAILURE_TTL_SECONDS - 1,
      ),
    ).toEqual({ routes: [], retainedFailure: "launch-blocked" });
    // Past it, the sweep is not evidence about the site any more. A Perch that
    // nobody has attempted for a while must not keep displaying a stale
    // attempt's verdict.
    expect(
      controller.diagnosticRouteStateForCollisionRevision(
        "about:test",
        5,
        100 + INSECT_ROUTE_FAILURE_TTL_SECONDS + 1,
      ),
    ).toEqual({ routes: [], retainedFailure: null });
  });

  it("escalates only on consecutive failures and resets the count on success", () => {
    const controller = new InsectDiagnosticsController();
    const blocked = [{ phase: "approach" as const, points: [], clear: false }];
    const clear = [{ phase: "approach" as const, points: [], clear: true }];
    const retained = () =>
      controller.diagnosticRouteStateForCollisionRevision("about:test", 99)
        .retainedFailure;

    for (
      let attempt = 1;
      attempt < INSECT_ROUTE_FAILURE_ESCALATION;
      attempt++
    ) {
      controller.clearRoutes("about:test");
      controller.publishRoutes("about:test", 1, blocked);
      expect(retained()).toBe("approach-blocked");
    }
    controller.clearRoutes("about:test");
    controller.publishRoutes("about:test", 1, blocked);
    expect(retained()).toBe("route-unreachable");

    // One insect reaching it proves the site routable; the count starts over,
    // so a later awkward approach is again just one failed attempt.
    controller.clearRoutes("about:test");
    controller.publishRoutes("about:test", 1, clear);
    controller.clearRoutes("about:test");
    controller.publishRoutes("about:test", 1, blocked);
    expect(retained()).toBe("approach-blocked");
  });

  it("drops stale successful routes and lets a cleared stale failure be recompiled", () => {
    const controller = new InsectDiagnosticsController();
    controller.publishRoutes("about:test", 3, [
      { phase: "hover", points: [], clear: true },
    ]);
    expect(
      controller.diagnosticRouteStateForCollisionRevision("about:test", 4),
    ).toEqual({ routes: [], retainedFailure: null });

    controller.publishRoutes("about:test", 4, [
      { phase: "launch", points: [], clear: false },
    ]);
    expect(
      controller.diagnosticRouteStateForCollisionRevision("about:test", 5),
    ).toEqual({ routes: [], retainedFailure: "launch-blocked" });
    controller.clearRoutes("about:test");
    expect(
      controller.diagnosticRouteStateForCollisionRevision("about:test", 5),
    ).toEqual({ routes: [], retainedFailure: null });
  });
});
