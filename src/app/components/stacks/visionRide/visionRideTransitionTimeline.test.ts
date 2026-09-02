import {
  VISION_RIDE_ENTRY_STATIC_SECONDS,
  VISION_RIDE_ENTRY_WHOOSH_SECONDS,
  VISION_RIDE_EXIT_STATIC_SECONDS,
  VISION_RIDE_EXIT_WHOOSH_SECONDS,
} from "../audio/sceneAudio";
import { describe, expect, it } from "vitest";

import { visionRideRoomMounted } from "./visionRideState";
import {
  VISION_RIDE_HEADSET_PITCH,
  VISION_RIDE_TIMELINE,
  crtAperture,
  cruisingPresentation,
  doffingPresentation,
  donningPresentation,
  flickerNoise,
  headsetFlightChoreography,
  lensCurtain,
  returningPresentation,
  roomEffectsActive,
} from "./visionRideTransitionTimeline";

const { entry, exit } = VISION_RIDE_TIMELINE;
const exitCollapseEnd = exit.flickerSeconds + exit.collapseSeconds;
const exitLineEnd = exitCollapseEnd + exit.lineHoldSeconds;
const exitDotEnd = exitLineEnd + exit.dotSeconds;

describe("Vision ride entry performance", () => {
  it("keeps the headset visible through the turn, then snaps to black at the face", () => {
    const turning = donningPresentation(entry.flightSeconds * 0.72, false);
    expect(turning.progress).toBeGreaterThan(0.75);
    expect(turning.progress).toBeLessThan(entry.curtainStartProgress);
    expect(turning.curtainAmount).toBe(0);
    expect(turning.staticAmount).toBe(0);
    const seating = donningPresentation(entry.flightSeconds * 0.92, false);
    expect(seating.curtainAmount).toBeGreaterThan(0);
    expect(seating.curtainAmount).toBeLessThan(1);
    // Seating goes to black. Static starts only after the headset is on.
    expect(seating.staticAmount).toBe(0);
    expect(cruisingPresentation(0, false).staticAmount).toBeGreaterThanOrEqual(
      0.7,
    );
    expect(donningPresentation(entry.flightSeconds, false).complete).toBe(true);
  });

  it("covers only during the final approach, not halfway through the flight", () => {
    expect(entry.curtainStartProgress).toBeGreaterThanOrEqual(0.93);
    expect(entry.curtainFullProgress).toBeGreaterThanOrEqual(0.99);
    expect(
      donningPresentation(entry.flightSeconds * 0.5, false).curtainAmount,
    ).toBe(0);
    let fullAt = Number.POSITIVE_INFINITY;
    for (let t = 0; t <= entry.flightSeconds; t += 0.005) {
      const beat = donningPresentation(t, false);
      if (beat.progress < entry.curtainStartProgress)
        expect(beat.curtainAmount).toBe(0);
      if (beat.progress >= entry.curtainFullProgress) {
        expect(beat.curtainAmount).toBe(1);
        expect(roomEffectsActive("donning", t, false)).toBe(false);
        fullAt = Math.min(fullAt, t);
      }
    }
    expect(fullAt).toBeLessThan(entry.flightSeconds);
    expect(fullAt).toBeGreaterThan(entry.flightSeconds * 0.94);
  });

  it("lifts first, turns in the middle, and leaves a final seating beat", () => {
    const lift = headsetFlightChoreography(0.12);
    const turn = headsetFlightChoreography(0.5);
    const seat = headsetFlightChoreography(0.86);
    expect(lift.arc).toBeGreaterThan(0);
    expect(lift.turnProgress).toBe(0);
    expect(turn.turnProgress).toBeGreaterThan(0.25);
    expect(turn.turnProgress).toBeLessThan(0.75);
    expect(seat.turnProgress).toBe(1);
    expect(seat.arc).toBeGreaterThan(0);
    expect(turn.seatProgress).toBe(0);
    expect(seat.seatProgress).toBeGreaterThan(0);
    expect(seat.faceClearanceProgress).toBe(1);
    expect(headsetFlightChoreography(1)).toEqual({
      travelProgress: 1,
      turnProgress: 1,
      arc: 0,
      seatProgress: 1,
      faceClearanceProgress: 1,
    });
  });

  it("pitches the visor down only on final approach so the strap clears the camera", () => {
    expect(VISION_RIDE_HEADSET_PITCH.wearing).toBeGreaterThan(
      VISION_RIDE_HEADSET_PITCH.travel + 0.4,
    );
    expect(headsetFlightChoreography(0.7).seatProgress).toBe(0);
    expect(headsetFlightChoreography(0.84).seatProgress).toBeGreaterThan(0.35);
    expect(headsetFlightChoreography(1).seatProgress).toBe(1);
    // Removal keeps the seated pitch at the face, then releases it quickly
    // once the headset has started backing away.
    expect(headsetFlightChoreography(0).faceClearanceProgress).toBe(0);
    expect(headsetFlightChoreography(0.22).faceClearanceProgress).toBe(1);
  });

  it("holds the aperture near closed through an irregular flicker beat", () => {
    for (const t of [0.05, 0.12, 0.19, 0.26, 0.33]) {
      const beat = cruisingPresentation(t, false);
      expect(beat.crtOpen).toBeLessThan(0.15);
      expect(beat.apertureHeight).toBeLessThan(0.35);
      expect(beat.staticAmount).toBeGreaterThanOrEqual(0.7);
      expect(beat.complete).toBe(false);
    }
    // Irregular, not sinusoidal: consecutive 30 Hz ticks differ.
    expect(flickerNoise(0.05)).not.toBeCloseTo(flickerNoise(0.12), 3);
  });

  it("stretches the dot into a line before the line opens vertically", () => {
    // The first 28 % of openness is all width; height follows.
    const dot = crtAperture(0);
    expect(dot).toEqual({ width: 0, height: 0 });
    const line = crtAperture(0.28);
    expect(line.width).toBe(1);
    expect(line.height).toBeLessThan(0.5);
    expect(crtAperture(0.14).width).toBeGreaterThan(crtAperture(0.14).height);
    expect(crtAperture(1)).toEqual({ width: 1, height: 1 });
  });

  it("opens the aperture monotonically after the flicker, beam dying", () => {
    const early = cruisingPresentation(entry.flickerSeconds + 0.2, false);
    const late = cruisingPresentation(entry.flickerSeconds + 0.6, false);
    expect(early.apertureHeight).toBeGreaterThan(0);
    expect(late.apertureHeight).toBeGreaterThan(early.apertureHeight);
    expect(late.beam).toBeLessThan(early.beam);
    const done = cruisingPresentation(
      entry.flickerSeconds + entry.apertureSeconds,
      false,
    );
    expect(done.crtOpen).toBe(1);
    expect(done.apertureWidth).toBe(1);
    expect(done.apertureHeight).toBe(1);
    expect(done.beam).toBe(0);
    expect(done.staticAmount).toBe(0);
    expect(done.complete).toBe(true);
  });
});

describe("Vision ride exit performance", () => {
  it("pulses static at full picture before collapsing", () => {
    for (const t of [0.05, 0.15, 0.25]) {
      const beat = doffingPresentation(t, false);
      expect(beat.apertureHeight).toBeGreaterThan(0.85);
      expect(beat.apertureWidth).toBe(1);
      expect(beat.staticAmount).toBeGreaterThanOrEqual(0.65);
      expect(beat.complete).toBe(false);
    }
  });

  it("collapses vertically to a bright full-width line", () => {
    const mid = doffingPresentation(
      exit.flickerSeconds + exit.collapseSeconds * 0.5,
      false,
    );
    expect(mid.apertureHeight).toBeGreaterThan(0);
    expect(mid.apertureHeight).toBeLessThan(1);
    expect(mid.apertureWidth).toBe(1);
    expect(mid.beam).toBeGreaterThan(0);
    const line = doffingPresentation(exitCollapseEnd, false);
    expect(line.apertureHeight).toBe(0);
    expect(line.apertureWidth).toBe(1);
    expect(line.beam).toBe(1);
    expect(line.complete).toBe(false);
  });

  it("holds the line, shrinks it to a dot, then dies into black", () => {
    const held = doffingPresentation(exitLineEnd - 0.01, false);
    expect(held.apertureWidth).toBe(1);
    expect(held.apertureHeight).toBe(0);
    expect(held.beam).toBe(1);
    const shrinking = doffingPresentation(
      exitLineEnd + exit.dotSeconds * 0.5,
      false,
    );
    expect(shrinking.apertureWidth).toBeGreaterThan(0);
    expect(shrinking.apertureWidth).toBeLessThan(1);
    expect(shrinking.apertureHeight).toBe(0);
    const dot = doffingPresentation(exitDotEnd, false);
    expect(dot.apertureWidth).toBe(0);
    expect(dot.crtOpen).toBe(0);
    expect(dot.beam).toBeGreaterThan(0); // afterglow
    expect(dot.complete).toBe(false); // black hold
    const done = doffingPresentation(exitDotEnd + exit.blackHoldSeconds, false);
    expect(done.beam).toBe(0);
    expect(done.staticAmount).toBe(0);
    expect(done.complete).toBe(true);
  });

  it("authors the switch-off at least as fully as the switch-on", () => {
    // Set-on: flicker, then one aperture ramp. Set-off: flicker, collapse,
    // line hold, dot shrink, afterglow. More beats, and more time in them.
    const switchOn = entry.flickerSeconds + entry.apertureSeconds;
    const switchOff = exitDotEnd + exit.blackHoldSeconds;
    expect(switchOff).toBeGreaterThanOrEqual(switchOn);
    const stages = [
      doffingPresentation(exit.flickerSeconds * 0.5, false),
      doffingPresentation(
        exit.flickerSeconds + exit.collapseSeconds * 0.5,
        false,
      ),
      doffingPresentation(exitCollapseEnd + exit.lineHoldSeconds * 0.5, false),
      doffingPresentation(exitLineEnd + exit.dotSeconds * 0.5, false),
      doffingPresentation(exitDotEnd + exit.blackHoldSeconds * 0.2, false),
    ].map((beat) =>
      [beat.apertureWidth, beat.apertureHeight, beat.beam]
        .map((v) => v.toFixed(2))
        .join(","),
    );
    expect(new Set(stages).size).toBe(stages.length);
  });

  it("gives both directions a deliberate full-frame static beat", () => {
    expect(entry.flickerSeconds).toBeGreaterThanOrEqual(0.45);
    expect(exit.flickerSeconds).toBeGreaterThanOrEqual(0.4);
    expect(
      cruisingPresentation(entry.flickerSeconds * 0.5, false).staticAmount,
    ).toBeGreaterThanOrEqual(0.7);
    expect(
      doffingPresentation(exit.flickerSeconds * 0.5, false).staticAmount,
    ).toBeGreaterThanOrEqual(0.65);
  });

  it("reveals from the face as soon as the black headset starts retreating", () => {
    const hold = returningPresentation(exit.returnHoldSeconds * 0.5, false);
    expect(hold.curtainAmount).toBe(1);
    expect(hold.progress).toBe(0);
    expect(hold.staticAmount).toBe(0);
    const revealStart = exit.returnHoldSeconds + exit.revealDelaySeconds;
    for (let t = 0; t < revealStart; t += 0.01) {
      expect(returningPresentation(t, false).curtainAmount).toBe(1);
    }
    const atReveal = returningPresentation(revealStart, false);
    expect(atReveal.progress).toBeLessThan(0.02);
    const revealed = returningPresentation(
      revealStart + exit.curtainRevealSeconds,
      false,
    );
    expect(revealed.curtainAmount).toBe(0);
    expect(revealed.staticAmount).toBe(0);
    expect(revealed.progress).toBeLessThan(0.25);
    expect(revealed.complete).toBe(false);
    expect(revealStart + exit.curtainRevealSeconds).toBeLessThan(
      exit.returnHoldSeconds + exit.returnFlightSeconds,
    );
    expect(
      returningPresentation(
        exit.returnHoldSeconds + exit.returnFlightSeconds,
        false,
      ).complete,
    ).toBe(true);
  });
});

describe("Vision ride lens curtain", () => {
  it("grows an opaque iris under normal motion, never a tinted veil", () => {
    expect(lensCurtain(0, false)).toEqual({ coverage: 0, opacity: 0 });
    let previous = 0;
    for (const amount of [0.05, 0.2, 0.5, 0.8, 0.95, 1]) {
      const lens = lensCurtain(amount, false);
      expect(lens.opacity).toBe(1);
      expect(lens.coverage).toBe(amount);
      expect(lens.coverage).toBeGreaterThan(previous);
      previous = lens.coverage;
    }
    // Through the donning fill every frame is solid inside the iris.
    for (let t = 0; t <= entry.flightSeconds; t += 0.02) {
      const beat = donningPresentation(t, false);
      const lens = lensCurtain(beat.curtainAmount, false);
      if (beat.curtainAmount > 0) expect(lens.opacity).toBe(1);
    }
  });

  it("dissolves the full frame only under reduced motion", () => {
    for (const amount of [0, 0.3, 0.7, 1]) {
      expect(lensCurtain(amount, true)).toEqual({
        coverage: 1,
        opacity: amount,
      });
    }
    expect(lensCurtain(1.7, true).opacity).toBe(1);
    expect(lensCurtain(-2, false).coverage).toBe(0);
  });
});

describe("Vision ride room effects", () => {
  it("keeps the room alive through the visible part of the donning flight", () => {
    expect(roomEffectsActive("idle", 0, false)).toBe(true);
    expect(roomEffectsActive("donning", 0, false)).toBe(true);
    // Alive while the headset is still rotating in the open, before the
    // static starts to fill.
    expect(roomEffectsActive("donning", entry.flightSeconds * 0.3, false)).toBe(
      true,
    );
    expect(
      donningPresentation(entry.flightSeconds * 0.3, false).progress,
    ).toBeLessThan(entry.curtainStartProgress);
  });

  it("switches the room off only once the static curtain is opaque", () => {
    expect(
      roomEffectsActive(
        "donning",
        entry.flightSeconds * entry.curtainFullProgress + 0.05,
        false,
      ),
    ).toBe(false);
    expect(roomEffectsActive("cruising", 3, false)).toBe(false);
    expect(roomEffectsActive("doffing", 0.1, false)).toBe(false);
  });

  it("restores the room under the opaque return hold before the reveal", () => {
    expect(roomEffectsActive("returning", 0, false)).toBe(true);
    expect(returningPresentation(0, false).curtainAmount).toBe(1);
    expect(exit.returnHoldSeconds).toBeGreaterThanOrEqual(0.15);
  });

  it("never exposes the room during the exit before its effects are back", () => {
    for (const reducedMotion of [false, true]) {
      // Line, dot and afterglow all leave a sliver of aperture, but the
      // room is unmounted for the whole of doffing, so only the ride can
      // show through it.
      expect(visionRideRoomMounted("cruising")).toBe(false);
      expect(visionRideRoomMounted("doffing")).toBe(false);
      const exitLength = reducedMotion
        ? exit.reducedCollapseSeconds
        : exitDotEnd + exit.blackHoldSeconds;
      for (let t = 0; t <= exitLength + 0.05; t += 0.01) {
        expect(roomEffectsActive("doffing", t, reducedMotion)).toBe(false);
      }
      // The return mounts the room at t=0 with effects live, under a lens
      // that is fully grown and fully opaque for the whole hold.
      expect(visionRideRoomMounted("returning")).toBe(true);
      let firstReveal = Number.POSITIVE_INFINITY;
      const flight = reducedMotion
        ? exit.reducedReturnSeconds
        : exit.returnFlightSeconds;
      for (let t = 0; t <= exit.returnHoldSeconds + flight; t += 0.01) {
        expect(roomEffectsActive("returning", t, reducedMotion)).toBe(true);
        const lens = lensCurtain(
          returningPresentation(t, reducedMotion).curtainAmount,
          reducedMotion,
        );
        const opaque = lens.coverage === 1 && lens.opacity === 1;
        if (!opaque) firstReveal = Math.min(firstReveal, t);
        if (t < exit.returnHoldSeconds) expect(opaque).toBe(true);
      }
      // Normal motion waits for the glass to clear the eye as well; the
      // reduced dissolve starts straight after the hold.
      const revealStart = reducedMotion
        ? exit.returnHoldSeconds
        : exit.returnHoldSeconds + exit.revealDelaySeconds;
      expect(firstReveal).toBeGreaterThanOrEqual(revealStart);
      expect(firstReveal).toBeLessThan(revealStart + exit.curtainRevealSeconds);
    }
  });
});

describe("Vision ride reduced motion", () => {
  it("replaces the performance with short dissolves", () => {
    const flight = donningPresentation(entry.reducedFlightSeconds, true);
    expect(flight.complete).toBe(true);
    expect(flight.staticAmount).toBe(0);
    const aperture = cruisingPresentation(entry.reducedApertureSeconds, true);
    expect(aperture.crtOpen).toBe(1);
    expect(aperture.staticAmount).toBe(0);
    expect(aperture.beam).toBe(0);
    const collapse = doffingPresentation(exit.reducedCollapseSeconds, true);
    expect(collapse.crtOpen).toBe(0);
    expect(collapse.staticAmount).toBe(0);
    expect(collapse.beam).toBe(0);
    expect(collapse.complete).toBe(true);
    expect(
      returningPresentation(
        exit.returnHoldSeconds + exit.reducedReturnSeconds,
        true,
      ).complete,
    ).toBe(true);
  });
});

describe("Vision ride audio sync", () => {
  it("resolves the donning whoosh during the final seating beat", () => {
    expect(VISION_RIDE_ENTRY_WHOOSH_SECONDS).toBeLessThanOrEqual(
      entry.flightSeconds,
    );
    expect(VISION_RIDE_ENTRY_WHOOSH_SECONDS).toBeGreaterThanOrEqual(
      entry.flightSeconds * 0.9,
    );
  });

  it("spans the removal whoosh across the flicker, collapse and dot", () => {
    expect(VISION_RIDE_EXIT_WHOOSH_SECONDS).toBeCloseTo(exitDotEnd, 5);
  });

  it("runs the static hiss under the visible static on both ends", () => {
    // Entry hiss starts after the headset is seated and follows the visible
    // static until the aperture has fully opened onto the road.
    expect(VISION_RIDE_ENTRY_STATIC_SECONDS).toBeCloseTo(
      entry.flickerSeconds + entry.apertureSeconds,
      5,
    );
    // Exit: dies with the dot, before the black hold.
    expect(VISION_RIDE_EXIT_STATIC_SECONDS).toBeCloseTo(exitDotEnd, 5);
  });
});
