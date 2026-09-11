import { describe, expect, it } from "vitest";

import {
  PROP_APPROACH_FILL,
  createPropApproach,
  createPropTurn,
  propApproachBottomFraction,
  wrapPropTurn,
} from "./propApproachState";

describe("prop approach frame", () => {
  it("puts a tall prop's foot at the fill's edge below centre", () => {
    // Height binds on a wide viewport for a prop tall enough to be framed
    // past the minimum distance: it fills `fill` of the frame, so its foot
    // sits that share of the half frame below the middle. (A 0.32 tile is
    // held at the 1.2 minimum instead and comes out smaller.)
    const bottom = propApproachBottomFraction({
      fovDegrees: 33,
      aspect: 16 / 9,
      height: 0.5,
      width: 0.5,
    });
    expect(bottom).toBeCloseTo(0.5 + 0.5 * PROP_APPROACH_FILL, 6);
  });

  it("sits higher when the width binds on a narrow viewport", () => {
    const wide = propApproachBottomFraction({
      fovDegrees: 33,
      aspect: 16 / 9,
      height: 0.32,
      width: 0.32,
    });
    const narrow = propApproachBottomFraction({
      fovDegrees: 33,
      aspect: 9 / 16,
      height: 0.32,
      width: 0.32,
    });
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeGreaterThan(0.5);
  });

  it("carries a link and starts with an empty frame", () => {
    const controller = createPropApproach("test:linked", {
      link: { href: "https://example.com/", label: "Example" },
    });
    expect(controller.link).toEqual({
      href: "https://example.com/",
      label: "Example",
    });
    expect(createPropApproach("test:plain").link).toBeNull();
    expect(controller.frame.bottom).toBe(0);
  });
});

describe("prop turn on the way home", () => {
  it("wraps a whole-lap yaw but keeps the fling", () => {
    const turn = createPropTurn();
    turn.yaw = Math.PI * 2 + 0.3;
    turn.yawVelocity = 2.5;
    wrapPropTurn(turn);
    expect(turn.yaw).toBeCloseTo(0.3, 9);
    // The wrapper runs the coast down over the flight; wrapping must not
    // stop it dead, which is the lock the owner saw on dismissal.
    expect(turn.yawVelocity).toBe(2.5);
  });
});
