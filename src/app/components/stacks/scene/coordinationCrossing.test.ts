// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { collectWirePassExclusions } from "./CoordinationCrossingPass";
import {
  COORDINATION_HREF,
  CROSSING_TIMELINE as T,
  blinkerPhase,
  coordinationBlinker,
  coordinationCrossing,
  createCoordinationCrossingController,
  crossingBlinker,
  crossingBlinkerSpot,
  crossingDustGain,
  crossingGrid,
  crossingOrbLight,
  openCoordinationWithCrossing,
} from "./coordinationCrossing";
import { COORDINATION_CROSSING_FRAGMENT } from "./coordinationCrossingShader";
import { CROSSING_WIRE_IGNORE } from "./coordinationCrossingWire";

const start = { startedAt: 0, origin: { x: 0, y: 0 }, theme: "dark" as const };

function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: matches(query) }));
}

afterEach(() => {
  coordinationCrossing.finish();
  coordinationCrossing.setEnabled(false);
  vi.unstubAllGlobals();
});

describe("coordination crossing controller", () => {
  it("starts on, and refuses a run once switched off", () => {
    const controller = createCoordinationCrossingController();
    expect(controller.getSnapshot()).toMatchObject({
      enabled: true,
      leaveRoom: true,
      dustOrb: true,
      run: null,
    });
    controller.setEnabled(false);
    expect(controller.begin(start)).toBe(false);
    controller.setEnabled(true);
    expect(controller.begin(start)).toBe(true);
  });

  it("runs one crossing at a time", () => {
    const controller = createCoordinationCrossingController();
    controller.setEnabled(true);
    controller.begin(start);
    expect(controller.begin(start)).toBe(false);
    controller.finish();
    expect(controller.begin(start)).toBe(true);
    expect(controller.getSnapshot().run?.id).toBe(2);
  });
});

describe("openCoordinationWithCrossing", () => {
  it("plays the crossing instead of opening a tab", () => {
    stubMatchMedia(() => false);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    coordinationCrossing.setEnabled(true);

    openCoordinationWithCrossing();

    expect(coordinationCrossing.getSnapshot().run).not.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("falls back to the new-tab link under Reduce Motion", () => {
    stubMatchMedia((query) => query.includes("reduced-motion"));
    const open = vi.fn();
    vi.stubGlobal("open", open);
    coordinationCrossing.setEnabled(true);

    openCoordinationWithCrossing();

    expect(coordinationCrossing.getSnapshot().run).toBeNull();
    expect(open).toHaveBeenCalledWith(
      COORDINATION_HREF,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("uses the system theme, which coordination.sh will show", () => {
    stubMatchMedia((query) => query.includes("prefers-color-scheme"));
    coordinationCrossing.setEnabled(true);
    openCoordinationWithCrossing();
    expect(coordinationCrossing.getSnapshot().run?.theme).toBe("dark");
  });
});

describe("crossing timeline", () => {
  it("runs long enough to read as an event", () => {
    expect(T.hold).toBeGreaterThanOrEqual(5000);
    expect(T.hold).toBeLessThanOrEqual(10000);
  });

  it("resolves everything before the hold frame takes over", () => {
    const takeover = T.hold - T.handoff;
    expect(
      T.shrinkStart + T.shrinkSpan + T.shrinkJitter / 2,
    ).toBeLessThanOrEqual(takeover);
    expect(T.orangeOutStart + T.orangeOutSpread).toBeLessThanOrEqual(takeover);
    expect(T.flareFadeEnd).toBeLessThanOrEqual(takeover);
    expect(T.travelStart + T.travelSpan).toBeLessThanOrEqual(takeover);
    expect(T.dustFadeEnd).toBeLessThanOrEqual(takeover);
    expect(T.gridOutStart + T.gridOutSpan).toBeLessThanOrEqual(takeover);
    expect(
      T.halftoneStart + T.halftoneSpread + T.halftoneSpan,
    ).toBeLessThanOrEqual(takeover);
  });

  it("fades the background and wires the props before the halftone covers them", () => {
    expect(T.wireStart).toBeGreaterThan(T.backgroundStart);
    expect(T.wireStart + T.wireSpan + T.wireSpread + T.jitter).toBeLessThan(
      T.halftoneStart + T.halftoneSpread + T.halftoneSpan,
    );
  });

  it("writes every timing into the shader as a float literal", () => {
    expect(COORDINATION_CROSSING_FRAGMENT).not.toContain("undefined");
    expect(COORDINATION_CROSSING_FRAGMENT).toContain(
      `${T.shrinkStart.toFixed(1)},`,
    );
  });
});

describe("the crossing's dots", () => {
  it("are drawn in the grid's space, so a scale carries the whole grid", () => {
    expect(COORDINATION_CROSSING_FRAGMENT).toContain(
      "vec2 grid = view + (px - view) / uGridScale;",
    );
    expect(COORDINATION_CROSSING_FRAGMENT).toContain("distance(grid, centre)");
  });
});

describe("the crossing's blinker glow", () => {
  it("stops at the block's edge like the page's box-shadow", () => {
    expect(COORDINATION_CROSSING_FRAGMENT).toContain(
      "blinkerGlow(px) * uBloom * outside",
    );
    expect(COORDINATION_CROSSING_FRAGMENT).toContain("uBloom * outside;");
  });
});

describe("crossingOrbLight", () => {
  it("swells on the press from the orb's rest", () => {
    expect(crossingOrbLight(0)).toBe(1);
    expect(crossingOrbLight(T.orbLightRise)).toBe(6);
  });

  it("goes out once the blinker has left", () => {
    expect(crossingOrbLight(T.orbLightFadeEnd)).toBe(0);
  });
});

describe("crossingBlinker", () => {
  it.each([0, 0.2, 0.5, 0.93])(
    "picks up the orb's blink where it was, at phase %s",
    (phase) => {
      const orb = coordinationBlinker(phase * T.blinkPeriod);
      const crossing = crossingBlinker(0, phase);
      expect(crossing.block).toBeCloseTo(orb.block);
      expect(crossing.bloom).toBeCloseTo(orb.bloom);
    },
  );

  it.each([0, 0.2, 0.5, 0.93])(
    "lands on the page's resting blinker from phase %s",
    (phase) => {
      expect(crossingBlinker(T.hold, phase)).toEqual({
        block: 1,
        bloom: 0.74,
        flare: 0,
      });
      expect(crossingBlinker(T.hold - 1, phase).bloom).toBeCloseTo(0.74, 1);
    },
  );

  it("keeps close to the page's clock on the way", () => {
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      const cycles = Math.round(T.hold / T.blinkPeriod + phase) - phase;
      expect(T.hold / cycles / T.blinkPeriod).toBeGreaterThan(0.92);
      expect(T.hold / cycles / T.blinkPeriod).toBeLessThan(1.09);
    }
  });

  it("reads the orb's phase from its clock", () => {
    expect(blinkerPhase(T.blinkPeriod * 3.25)).toBeCloseTo(0.25);
  });

  it("flares across the room while the room is still there", () => {
    expect(crossingBlinker(0).flare).toBe(0);
    expect(crossingBlinker(T.flareStart + T.flareRise).flare).toBe(1);
    expect(crossingBlinker(T.flareFadeStart).flare).toBe(1);
  });
});

describe("crossingBlinkerSpot", () => {
  const from = { x: 900, y: 300, em: 20 };
  const to = { x: 500, y: 450, em: 60 };

  it("starts on the orb and stays there through the press", () => {
    expect(crossingBlinkerSpot(0, from, to)).toEqual(from);
    expect(crossingBlinkerSpot(T.travelStart, from, to)).toEqual(from);
  });

  it("lands exactly on the page's mark", () => {
    expect(crossingBlinkerSpot(T.travelStart + T.travelSpan, from, to)).toEqual(
      to,
    );
    expect(crossingBlinkerSpot(T.hold, from, to)).toEqual(to);
  });

  it("gets there slowly, with no jump between frames", () => {
    let last = from;
    for (let time = 0; time <= T.hold; time += 1000 / 60) {
      const spot = crossingBlinkerSpot(time, from, to);
      expect(Math.hypot(spot.x - last.x, spot.y - last.y)).toBeLessThan(2);
      expect(spot.em).toBeGreaterThanOrEqual(last.em);
      last = spot;
    }
  });
});

describe("crossingGrid", () => {
  const end = T.gridOutStart + T.gridOutSpan;

  it("holds the page's own grid until it sets out", () => {
    expect(crossingGrid(0)).toEqual({ scale: 1, fade: 1 });
    expect(crossingGrid(T.gridOutStart)).toEqual({ scale: 1, fade: 1 });
  });

  it("ends where the page's intro starts: 3x, and gone", () => {
    expect(crossingGrid(end)).toEqual({ scale: 3, fade: 0 });
    expect(crossingGrid(T.hold)).toEqual({ scale: 3, fade: 0 });
  });

  it("is the page's keyframes backwards, fading only on the way to 3x", () => {
    const halfway = crossingGrid(T.gridOutStart + T.gridOutSpan / 2);
    expect(halfway.fade).toBe(1);
    expect(halfway.scale).toBeGreaterThan(1.1);
    expect(halfway.scale).toBeLessThan(1.4);
  });

  it("only ever widens and dims", () => {
    let last = crossingGrid(T.gridOutStart);
    for (let time = T.gridOutStart; time <= end; time += 1000 / 60) {
      const grid = crossingGrid(time);
      expect(grid.scale).toBeGreaterThanOrEqual(last.scale);
      expect(grid.fade).toBeLessThanOrEqual(last.fade);
      last = grid;
    }
  });
});

describe("crossingDustGain", () => {
  it("is brightest on the press and settles to the page's own", () => {
    expect(crossingDustGain(0)).toBe(2.5);
    expect(crossingDustGain(4000)).toBeLessThan(1.1);
  });

  it("is gone before the hold frame takes over", () => {
    expect(crossingDustGain(T.dustFadeEnd)).toBe(0);
  });
});

describe("collectWirePassExclusions", () => {
  const named = (name: string, ...children: THREE.Object3D[]) => {
    const group = new THREE.Group();
    group.name = name;
    group.add(...children);
    return group;
  };
  const mesh = (material = new THREE.MeshBasicMaterial()) =>
    new THREE.Mesh(new THREE.BufferGeometry(), material);

  it("keeps the room units and drops the environment around them", () => {
    const prop = mesh();
    const meadow = named("meadow", mesh());
    const sky = mesh();
    const light = new THREE.DirectionalLight();
    const scene = new THREE.Scene();
    scene.add(named("scroll", named("room-unit:0", prop), meadow), sky, light);

    const excluded = collectWirePassExclusions(scene);

    expect(excluded).toContain(meadow);
    expect(excluded).toContain(sky);
    expect(excluded).not.toContain(prop);
    expect(excluded).not.toContain(light);
  });

  it("fades glows and light sources with the room instead of wiring them", () => {
    const sprite = new THREE.Sprite();
    const dust = new THREE.Points();
    const block = mesh();
    block.userData[CROSSING_WIRE_IGNORE] = true;
    const prop = mesh();
    const scene = new THREE.Scene();
    scene.add(named("room-unit:0", prop, sprite, dust, block));

    const excluded = collectWirePassExclusions(scene);

    expect(excluded).toEqual(expect.arrayContaining([sprite, dust, block]));
    expect(excluded).not.toContain(prop);
  });

  it("never draws a glow card as a sheet against its lamp", () => {
    const halo = mesh(
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const contactShade = mesh(
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    );
    const cutout = mesh(new THREE.MeshBasicMaterial({ transparent: true }));
    const scene = new THREE.Scene();
    scene.add(named("room-unit:0", halo, contactShade, cutout));

    const excluded = collectWirePassExclusions(scene);

    expect(excluded).toEqual(expect.arrayContaining([halo, contactShade]));
    expect(excluded).not.toContain(cutout);
  });

  it("drops invisible hit areas inside a unit", () => {
    const hitArea = mesh(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    const prop = mesh();
    const scene = new THREE.Scene();
    scene.add(named("room-unit:2", prop, hitArea));

    const excluded = collectWirePassExclusions(scene);

    expect(excluded).toContain(hitArea);
    expect(excluded).not.toContain(prop);
  });
});
