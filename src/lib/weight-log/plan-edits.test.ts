import { describe, expect, it } from "vitest";

import { PHASE_KINDS, addDays } from "./phases";
import {
  MAX_PLAN_WEEKS,
  type PlanEdit,
  PlanEditError,
  type PlanState,
  type PlanWeek,
  applyPlanEdit,
  planEndMove,
  planRateChange,
  planStartPhase,
  planViolations,
} from "./plan-edits";

// Every weight here is invented.

/** Consecutive planned weeks from a Monday, one target per week. */
function weeks(
  phaseId: number,
  start: string,
  targets: (number | null)[],
  originals: (number | null)[] = targets,
): PlanWeek[] {
  return targets.map((target, index) => ({
    weekStart: addDays(start, index * 7),
    phaseId,
    target,
    originalTarget: originals[index] ?? null,
  }));
}

/**
 * A finished cut of three weeks, then a running bulk of six weeks planned at
 * +0.5 lb/wk from 2030-01-28. The owner weighed in through the bulk's second
 * week.
 */
function seed(): PlanState {
  return {
    phases: [
      { id: 1, kind: "cut", startDate: "2030-01-07", endDate: "2030-01-27" },
      { id: 2, kind: "bulk", startDate: "2030-01-28", endDate: null },
    ],
    weeks: [
      ...weeks(1, "2030-01-07", [102, 101, 100]),
      ...weeks(2, "2030-01-28", [100, 100.5, 101, 101.5, 102, 102.5]),
    ],
    weighInWeeks: new Set([
      "2030-01-07",
      "2030-01-14",
      "2030-01-21",
      "2030-01-28",
      "2030-02-04",
    ]),
  };
}

const NEW_ID = 99;

function apply(state: PlanState, edit: PlanEdit) {
  const next = applyPlanEdit(state, edit, NEW_ID);
  expect(planViolations(next)).toEqual([]);
  return next;
}

const targetsOf = (state: PlanState, phaseId: number) =>
  state.weeks
    .filter((week) => week.phaseId === phaseId)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((week) => week.target);

const originalsOf = (state: PlanState, phaseId: number) =>
  state.weeks
    .filter((week) => week.phaseId === phaseId)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((week) => week.originalTarget);

function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof PlanEditError) return error.code;
    throw error;
  }
  return "allowed";
}

describe("planViolations", () => {
  it("passes the seed and names overlaps, running phases, and weeks outside a phase", () => {
    expect(planViolations(seed())).toEqual([]);
    const broken: PlanState = {
      phases: [
        { id: 1, kind: "cut", startDate: "2030-01-07", endDate: "2030-02-03" },
        { id: 2, kind: "bulk", startDate: "2030-01-28", endDate: null },
        { id: 3, kind: "bulk", startDate: "2030-03-04", endDate: null },
      ],
      weeks: [
        ...weeks(1, "2030-02-04", [100]),
        ...weeks(2, "2030-01-21", [100]),
      ],
      weighInWeeks: new Set(),
    };
    expect(planViolations(broken)).toEqual([
      "phase 1 overlaps phase 2",
      "phase 2 is running before phase 3",
      "week 2030-02-04 lies outside phase 1",
      "week 2030-01-21 lies outside phase 2",
    ]);
  });
});

describe("planRateChange", () => {
  it("sets the week's target from the week before and shifts every later target by the same amount", () => {
    const state = seed();
    const edit = planRateChange(state, {
      weekStart: "2030-02-11",
      poundsPerWeek: 0.25,
    });
    const next = apply(state, edit);
    // Week 3 was 101 (+0.5); at +0.25 it is 100.75, so later weeks drop 0.25.
    expect(targetsOf(next, 2)).toEqual([100, 100.5, 100.75, 101.25, 101.75, 102.25]);
    // Weeks before the changed one are not rewritten.
    expect(edit.writeWeeks.map((week) => week.weekStart)).toEqual([
      "2030-02-11",
      "2030-02-18",
      "2030-02-25",
      "2030-03-04",
    ]);
    // The other phase is untouched.
    expect(targetsOf(next, 1)).toEqual([102, 101, 100]);
  });

  it("keeps every original target", () => {
    const state = seed();
    const next = apply(
      state,
      planRateChange(state, { weekStart: "2030-02-04", poundsPerWeek: -1 }),
    );
    expect(targetsOf(next, 2)).toEqual([100, 99, 99.5, 100, 100.5, 101]);
    expect(originalsOf(next, 2)).toEqual(originalsOf(state, 2));
  });

  it("composes: two changes leave the targets the rates describe, with no float noise", () => {
    let state = seed();
    state = apply(
      state,
      planRateChange(state, { weekStart: "2030-02-04", poundsPerWeek: 0.1 }),
    );
    state = apply(
      state,
      planRateChange(state, { weekStart: "2030-02-25", poundsPerWeek: 0.2 }),
    );
    expect(targetsOf(state, 2)).toEqual([100, 100.1, 100.6, 101.1, 101.3, 101.8]);
  });

  it("changes an ended phase's weeks only within that phase", () => {
    const state = seed();
    const next = apply(
      state,
      planRateChange(state, { weekStart: "2030-01-14", poundsPerWeek: -0.5 }),
    );
    expect(targetsOf(next, 1)).toEqual([102, 101.5, 100.5]);
    expect(targetsOf(next, 2)).toEqual(targetsOf(state, 2));
  });

  it("writes nothing when the rate is unchanged", () => {
    expect(
      planRateChange(seed(), { weekStart: "2030-02-11", poundsPerWeek: 0.5 })
        .writeWeeks,
    ).toEqual([]);
  });

  it("refuses a phase's first week, a week with no plan, and a target out of range", () => {
    const state = seed();
    expect(
      refusal(() =>
        planRateChange(state, { weekStart: "2030-01-28", poundsPerWeek: 1 }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      refusal(() =>
        planRateChange(state, { weekStart: "2031-01-06", poundsPerWeek: 1 }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      refusal(() =>
        planRateChange(state, { weekStart: "2030-02-12", poundsPerWeek: 1 }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      refusal(() =>
        planRateChange(state, {
          weekStart: "2030-02-04",
          poundsPerWeek: -100.5,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});

describe("planEndMove", () => {
  it("adds weeks at the last rate with no original target", () => {
    const state = seed();
    const next = apply(
      state,
      planEndMove(state, { phaseId: 2, lastWeek: "2030-03-18" }),
    );
    expect(targetsOf(next, 2)).toEqual([
      100, 100.5, 101, 101.5, 102, 102.5, 103, 103.5,
    ]);
    expect(originalsOf(next, 2)).toEqual([
      100, 100.5, 101, 101.5, 102, 102.5, null, null,
    ]);
  });

  it("uses the rate the owner last set, not the plan's first one", () => {
    let state = seed();
    state = apply(
      state,
      planRateChange(state, { weekStart: "2030-03-04", poundsPerWeek: 0.2 }),
    );
    state = apply(
      state,
      planEndMove(state, { phaseId: 2, lastWeek: "2030-03-11" }),
    );
    expect(targetsOf(state, 2).slice(-2)).toEqual([102.2, 102.4]);
  });

  it("extends a one-week plan flat", () => {
    const state: PlanState = {
      phases: [
        { id: 1, kind: "maintenance", startDate: "2030-01-07", endDate: null },
      ],
      weeks: weeks(1, "2030-01-07", [150]),
      weighInWeeks: new Set(),
    };
    const next = apply(
      state,
      planEndMove(state, { phaseId: 1, lastWeek: "2030-01-21" }),
    );
    expect(targetsOf(next, 1)).toEqual([150, 150, 150]);
  });

  it("removes empty weeks from the end", () => {
    const state = seed();
    const edit = planEndMove(state, { phaseId: 2, lastWeek: "2030-02-11" });
    expect(edit.deleteWeeks).toEqual(["2030-02-18", "2030-02-25", "2030-03-04"]);
    expect(targetsOf(apply(state, edit), 2)).toEqual([100, 100.5, 101]);
  });

  it("refuses to remove a week that holds weigh-ins, naming the latest one", () => {
    const state = seed();
    expect(() =>
      planEndMove(
        { ...state, weighInWeeks: new Set(["2030-02-04", "2030-02-11"]) },
        { phaseId: 2, lastWeek: "2030-01-28" },
      ),
    ).toThrow("The week of Feb 11, 2030 has weigh-ins");
    // Ending right after the last weigh-in is allowed.
    expect(
      planEndMove(state, { phaseId: 2, lastWeek: "2030-02-04" }).deleteWeeks,
    ).toHaveLength(4);
  });

  it("refuses an ended phase, a non-Monday, and a plan past the limit", () => {
    const state = seed();
    expect(
      refusal(() => planEndMove(state, { phaseId: 1, lastWeek: "2030-01-28" })),
    ).toBe("BAD_REQUEST");
    expect(
      refusal(() => planEndMove(state, { phaseId: 2, lastWeek: "2030-03-19" })),
    ).toBe("BAD_REQUEST");
    expect(
      refusal(() =>
        planEndMove(state, {
          phaseId: 2,
          lastWeek: addDays("2030-01-28", MAX_PLAN_WEEKS * 7),
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      refusal(() => planEndMove(state, { phaseId: 7, lastWeek: "2030-03-18" })),
    ).toBe("NOT_FOUND");
  });
});

describe("planStartPhase", () => {
  const start = {
    kind: "cut" as const,
    startTarget: 101,
    poundsPerWeek: -0.5,
    currentPhaseId: 2,
  };

  it("ends the current phase the day before, trims its empty tail, and writes original targets", () => {
    const state = seed();
    const edit = planStartPhase(state, {
      ...start,
      startDate: "2030-02-18",
      lastWeek: "2030-03-11",
    });
    expect(edit.endPhases).toEqual([{ id: 2, endDate: "2030-02-17" }]);
    const next = apply(state, edit);
    expect(next.phases.find((phase) => phase.id === NEW_ID)).toEqual({
      id: NEW_ID,
      kind: "cut",
      startDate: "2030-02-18",
      endDate: null,
    });
    // The bulk keeps its weeks before the new start, empty or not.
    expect(targetsOf(next, 2)).toEqual([100, 100.5, 101]);
    expect(targetsOf(next, NEW_ID)).toEqual([101, 100.5, 100, 99.5]);
    expect(originalsOf(next, NEW_ID)).toEqual([101, 100.5, 100, 99.5]);
  });

  it("deletes the old tail past a shorter new plan", () => {
    const state = seed();
    const edit = planStartPhase(state, {
      ...start,
      startDate: "2030-02-18",
      lastWeek: "2030-02-18",
    });
    expect(edit.deleteWeeks).toEqual(["2030-02-25", "2030-03-04"]);
    expect(apply(state, edit).weeks).toHaveLength(3 + 3 + 1);
  });

  it("moves a week that already holds weigh-ins into the new phase (review finding 5)", () => {
    const state = seed();
    // The owner weighed in on the new start's Monday before starting it.
    const weighedIn = {
      ...state,
      weighInWeeks: new Set([...state.weighInWeeks, "2030-02-11"]),
    };
    const next = apply(
      weighedIn,
      planStartPhase(weighedIn, {
        ...start,
        startDate: "2030-02-11",
        lastWeek: "2030-02-25",
      }),
    );
    const moved = next.weeks.find((week) => week.weekStart === "2030-02-11");
    expect(moved).toEqual({
      weekStart: "2030-02-11",
      phaseId: NEW_ID,
      target: 101,
      originalTarget: 101,
    });
    expect(targetsOf(next, 2)).toEqual([100, 100.5]);
  });

  it("can start in the past, as long as the plan covers the weeks weighed in since", () => {
    const state = seed();
    const next = apply(
      state,
      planStartPhase(state, {
        ...start,
        startDate: "2030-02-04",
        lastWeek: "2030-02-11",
      }),
    );
    expect(targetsOf(next, 2)).toEqual([100]);
    expect(targetsOf(next, NEW_ID)).toEqual([101, 100.5]);
  });

  it("refuses a plan that would drop a week with weigh-ins", () => {
    const state = seed();
    expect(
      refusal(() =>
        planStartPhase(state, {
          ...start,
          startDate: "2030-01-28",
          lastWeek: "2030-01-28",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("replaces the current phase when started on its own Monday", () => {
    const state = seed();
    const edit = planStartPhase(state, {
      ...start,
      startDate: "2030-01-28",
      lastWeek: "2030-02-11",
    });
    expect(edit.deletePhases).toEqual([2]);
    expect(edit.endPhases).toEqual([]);
    const next = apply(state, edit);
    expect(next.phases.map((phase) => phase.id)).toEqual([1, NEW_ID]);
    expect(targetsOf(next, NEW_ID)).toEqual([101, 100.5, 100]);
  });

  it("refuses a start before the current phase, a non-Monday, an inverted plan, and a stale page", () => {
    const state = seed();
    const cases = [
      { startDate: "2030-01-21", lastWeek: "2030-03-04" },
      { startDate: "2030-02-19", lastWeek: "2030-03-04" },
      { startDate: "2030-02-18", lastWeek: "2030-03-05" },
      { startDate: "2030-02-18", lastWeek: "2030-02-11" },
      {
        startDate: "2030-02-18",
        lastWeek: addDays("2030-02-18", MAX_PLAN_WEEKS * 7),
      },
    ];
    expect(
      cases.map((dates) =>
        refusal(() => planStartPhase(state, { ...start, ...dates })),
      ),
    ).toEqual(cases.map(() => "BAD_REQUEST"));
    expect(
      refusal(() =>
        planStartPhase(state, {
          ...start,
          currentPhaseId: 1,
          startDate: "2030-02-18",
          lastWeek: "2030-03-04",
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("starts the first phase of an empty log", () => {
    const empty: PlanState = { phases: [], weeks: [], weighInWeeks: new Set() };
    const next = apply(
      empty,
      planStartPhase(empty, {
        ...start,
        currentPhaseId: null,
        startDate: "2030-01-07",
        lastWeek: "2030-01-14",
      }),
    );
    expect(targetsOf(next, NEW_ID)).toEqual([101, 100.5]);
  });
});

/** mulberry32, so the sequence is the same on every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("plan rules hold after every edit", () => {
  it("survives 1,000 random edits with no overlap and no week outside its phase", () => {
    const next = random(7);
    const pick = <T>(items: readonly T[]) =>
      items[Math.floor(next() * items.length)]!;
    let state = seed();
    let nextId = 100;
    const applied = { start: 0, end: 0, rate: 0 };
    let kind: keyof typeof applied;
    const problems: string[] = [];
    const originals = new Map<string, number | null>();
    const keyOf = (week: PlanWeek) => `${week.phaseId}:${week.weekStart}`;
    for (const week of state.weeks) originals.set(keyOf(week), week.originalTarget);

    for (let step = 0; step < 1000; step++) {
      // Sometimes the owner weighs in the week after the latest weigh-in.
      if (next() < 0.3) {
        const latest = [...state.weighInWeeks].sort().at(-1)!;
        state = {
          ...state,
          weighInWeeks: new Set([...state.weighInWeeks, addDays(latest, 7)]),
        };
      }
      const running = state.phases.find((phase) => phase.endDate === null)!;
      const lastPlanned =
        state.weeks
          .filter((week) => week.phaseId === running.id)
          .map((week) => week.weekStart)
          .sort()
          .at(-1) ?? running.startDate;
      let edit: PlanEdit;
      try {
        const roll = next();
        if (roll < 0.2) {
          kind = "start";
          const startDate = addDays(
            running.startDate,
            Math.floor(next() * 10) * 7,
          );
          edit = planStartPhase(state, {
            kind: pick(PHASE_KINDS),
            startDate,
            lastWeek: addDays(startDate, Math.floor(next() * 8) * 7),
            startTarget: 150 + Math.round(next() * 100) / 10,
            poundsPerWeek: Math.round((next() - 0.5) * 20) / 10,
            currentPhaseId: running.id,
          });
        } else if (roll < 0.6) {
          kind = "end";
          edit = planEndMove(state, {
            phaseId: running.id,
            lastWeek: addDays(lastPlanned, (Math.floor(next() * 12) - 4) * 7),
          });
        } else {
          kind = "rate";
          edit = planRateChange(state, {
            weekStart: pick(state.weeks).weekStart,
            poundsPerWeek: Math.round((next() - 0.5) * 20) / 10,
          });
        }
      } catch (error) {
        if (error instanceof PlanEditError) continue;
        throw error;
      }
      const newId = nextId++;
      state = applyPlanEdit(state, edit, newId);
      applied[kind]++;
      problems.push(...planViolations(state).map((p) => `step ${step}: ${p}`));

      // A week's original target never changes while it stays in its phase.
      // A week added to an existing phase has none, including a week removed
      // from the end and added again.
      const present = new Set(state.weeks.map(keyOf));
      for (const key of originals.keys()) {
        if (!present.has(key)) originals.delete(key);
      }
      for (const week of state.weeks) {
        const key = keyOf(week);
        if (originals.has(key)) {
          if (week.originalTarget !== originals.get(key)) {
            problems.push(`step ${step}: ${key} original target changed`);
          }
        } else {
          if (week.phaseId !== newId && week.originalTarget !== null) {
            problems.push(`step ${step}: added week ${key} has an original`);
          }
          originals.set(key, week.originalTarget);
        }
      }
    }
    expect(problems).toEqual([]);
    // Each kind of edit ran often enough to mean something.
    expect(Math.min(...Object.values(applied))).toBeGreaterThan(50);
  });
});
