// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { collectWirePassExclusions } from "./CoordinationCrossingPass";
import {
  CROSSING_TIMELINE as T,
  COORDINATION_HREF,
  coordinationCrossing,
  createCoordinationCrossingController,
  crossingBlinker,
  crossingSurge,
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
    expect(T.shrinkStart + T.shrinkSpan + T.shrinkJitter / 2).toBeLessThanOrEqual(
      takeover,
    );
    expect(T.orangeOutStart + T.orangeOutSpread).toBeLessThanOrEqual(takeover);
    expect(T.flareFadeEnd).toBeLessThanOrEqual(takeover);
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

describe("the crossing's blinker glow", () => {
  it("stops at the block's edge like the page's box-shadow", () => {
    expect(COORDINATION_CROSSING_FRAGMENT).toContain(
      "blinkerGlow(px) * uBloom * outside",
    );
    expect(COORDINATION_CROSSING_FRAGMENT).toContain("uBloom * outside;");
  });
});

describe("crossingSurge", () => {
  it("swells the orb's light up to the moment the blinker strikes", () => {
    expect(crossingSurge(0)).toBe(0);
    expect(crossingSurge(T.blinkStart / 2)).toBeCloseTo(0.5);
    expect(crossingSurge(T.blinkStart)).toBe(1);
  });
});

describe("crossingBlinker", () => {
  it("stays dark until its first strike", () => {
    expect(crossingBlinker(T.blinkStart - 1)).toEqual({
      block: 0,
      bloom: 0,
      flare: 0,
    });
  });

  it("strikes on, and blinks hard on coordination.sh's clock", () => {
    expect(crossingBlinker(T.blinkStart).block).toBe(1);
    expect(crossingBlinker(T.blinkStart + T.blinkPeriod * 0.6).block).toBe(0);
  });

  it("flares across the room while the room is still there", () => {
    expect(crossingBlinker(T.blinkStart + T.flareRise).flare).toBe(1);
    expect(crossingBlinker(T.flareFadeStart).flare).toBe(1);
  });

  it("lands on the page's resting blinker at the hold", () => {
    expect(crossingBlinker(T.hold)).toEqual({ block: 1, bloom: 0.74, flare: 0 });
    expect(crossingBlinker(T.hold + 500)).toEqual({
      block: 1,
      bloom: 0.74,
      flare: 0,
    });
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
    scene.add(
      named("scroll", named("room-unit:0", prop), meadow),
      sky,
      light,
    );

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
