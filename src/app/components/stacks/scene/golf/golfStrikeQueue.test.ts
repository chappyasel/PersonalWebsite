import { describe, expect, it } from "vitest";

import {
  GolfStrikeQueue,
  nextReadyClubTarget,
  nextReadyGolfBall,
  shouldAdvanceGolfStrike,
} from "./golfStrikeQueue";

describe("golf strike queue", () => {
  it("advances an explicit club tap even from the neighbouring shelf zone", () => {
    expect(
      shouldAdvanceGolfStrike(false, { current: null, queued: ["one"] }),
    ).toBe(true);
    expect(shouldAdvanceGolfStrike(false, { current: "one", queued: [] })).toBe(
      true,
    );
    expect(shouldAdvanceGolfStrike(false, { current: null, queued: [] })).toBe(
      false,
    );
  });
  it("lets a club tap select the first genuinely available ball", () => {
    expect(
      nextReadyGolfBall(
        [
          { id: "one", phase: "flight" },
          { id: "two", phase: "ready" },
          { id: "three", phase: "queued" },
          { id: "four", phase: "ready" },
        ],
        ["one", "two", "three", "four"],
      ),
    ).toBe("two");
  });

  it("lets a club tap target a ready tennis ball", () => {
    expect(
      nextReadyClubTarget(
        [
          {
            id: "grab:ball:tennis",
            golf: false,
            phase: "ready",
            position: { x: -2.2, z: 0.2 },
          },
        ],
        { x: -3, z: 0 },
      ),
    ).toBe("grab:ball:tennis");
  });

  it("prioritizes a carried-in prop over the golf balls already in the bay", () => {
    expect(
      nextReadyClubTarget(
        [
          {
            id: "golf-ball:one",
            golf: true,
            phase: "ready",
            position: { x: -2.8, z: 0.1 },
          },
          {
            id: "grab:ball:tennis",
            golf: false,
            phase: "ready",
            position: { x: -1.7, z: 0.2 },
          },
        ],
        { x: -3, z: 0 },
      ),
    ).toBe("grab:ball:tennis");
  });
  it("queues four unique balls and launches each at its impact frame", () => {
    const queue = new GolfStrikeQueue();
    expect(queue.tap("one")).toBe(true);
    expect(queue.tap("one")).toBe(false);
    expect(queue.tap("two")).toBe(true);
    expect(queue.tap("three")).toBe(true);
    expect(queue.tap("four")).toBe(true);
    const impacts: string[] = [];
    for (let frame = 0; frame < 320; frame += 1) {
      const impact = queue.advance(1 / 60);
      if (impact) impacts.push(impact);
    }
    expect(impacts).toEqual(["one", "two", "three", "four"]);
  });

  it("does not let celebration state block the queue and releases on reset", () => {
    const queue = new GolfStrikeQueue();
    queue.tap("one");
    queue.tap("two");
    // There is intentionally no celebration input: the club remains a pure
    // serial strike queue while cup effects run alongside it.
    const impacts = Array.from({ length: 160 }, () =>
      queue.advance(1 / 60),
    ).filter(Boolean);
    expect(impacts).toEqual(["one", "two"]);
    expect(queue.tap("one")).toBe(false);
    queue.release("one");
    expect(queue.tap("one")).toBe(true);
    queue.cancel();
    expect(queue.snapshot()).toMatchObject({ queued: [], current: null });
  });
});
