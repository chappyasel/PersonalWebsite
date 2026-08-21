import { describe, expect, it } from "vitest";

import {
  MEADOW_PHYSICAL_EVENTS,
  getMeadowDisturbance,
  publishMeadowPhysicalEvent,
  resetMeadowDisturbance,
  visitMeadowPhysicalEventsSince,
} from "./meadowDisturbance";

function publish(index: number, kind: "impact" | "trail" = "impact") {
  publishMeadowPhysicalEvent({
    kind,
    startX: index - 0.1,
    startZ: 0.2,
    endX: index,
    endZ: 0.5,
    y: -1.1,
    directionX: 3,
    directionZ: 4,
    strength: 0.7,
    radius: 0.25,
    timeScale: 2,
  });
}

describe("meadow disturbance bridge", () => {
  it("publishes stable normalized impact and segment data", () => {
    const before = getMeadowDisturbance();
    const revision = before.physicalEvent.revision;
    publish(2, "trail");
    const after = getMeadowDisturbance();
    expect(after).toBe(before);
    expect(after.physicalEvent).toMatchObject({
      kind: "trail",
      startX: 1.9,
      startZ: 0.2,
      endX: 2,
      endZ: 0.5,
      directionX: 0.6,
      directionZ: 0.8,
      strength: 0.7,
      radius: 0.25,
      timeScale: 2,
      revision: revision + 1,
    });
  });

  it("retains the stronger bounded impulse reserved for authored effects", () => {
    publishMeadowPhysicalEvent({
      kind: "impact",
      startX: 0,
      startZ: 0,
      endX: 0,
      endZ: 0,
      y: -1.1,
      directionX: 0,
      directionZ: 0,
      strength: 3,
      radius: 1,
      timeScale: 1,
    });
    expect(getMeadowDisturbance().physicalEvent.strength).toBe(2);
  });

  it("retains eight events in revision order after overflow", () => {
    const revision = getMeadowDisturbance().physicalEvent.revision;
    for (let index = 0; index < MEADOW_PHYSICAL_EVENTS + 2; index += 1)
      publish(index);
    const visited: number[] = [];
    const latest = visitMeadowPhysicalEventsSince(revision, (event) =>
      visited.push(event.endX),
    );
    expect(visited).toEqual(
      Array.from({ length: MEADOW_PHYSICAL_EVENTS }, (_, index) => index + 2),
    );
    expect(latest).toBe(revision + MEADOW_PHYSICAL_EVENTS + 2);
  });

  it("visits without cloning ring entries and increments reset once", () => {
    publish(7);
    const event = getMeadowDisturbance().physicalEvent;
    let retained: typeof event | null = null;
    let revisited: typeof event | null = null;
    visitMeadowPhysicalEventsSince(event.revision - 1, (value) => {
      retained = value;
    });
    visitMeadowPhysicalEventsSince(event.revision - 1, (value) => {
      revisited = value;
    });
    expect(revisited).toBe(retained);
    const resetRevision = getMeadowDisturbance().resetRevision;
    resetMeadowDisturbance();
    expect(getMeadowDisturbance().resetRevision).toBe(resetRevision + 1);
    expect(getMeadowDisturbance().physicalEvent.strength).toBe(0);
  });
});
