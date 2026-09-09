import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { grabbablePhysicsEnabled } from "./grabbablePhysics";

const source = readFileSync(
  new URL("./Grabbable.tsx", import.meta.url),
  "utf8",
);
const sceneSource = readFileSync(
  new URL("./Scene.tsx", import.meta.url),
  "utf8",
);
const primitivesSource = readFileSync(
  new URL("./primitives.tsx", import.meta.url),
  "utf8",
);
const objectsSource = readFileSync(
  new URL("./objects.tsx", import.meta.url),
  "utf8",
);

describe("Grabbable physics preference", () => {
  it("keeps shelf physics on by default", () => {
    expect(grabbablePhysicsEnabled()).toBe(true);
    expect(grabbablePhysicsEnabled(true)).toBe(true);
  });

  it("allows authored contact compositions to opt out", () => {
    expect(grabbablePhysicsEnabled(false)).toBe(false);
  });
});

describe("Grabbable viewport-edge interaction", () => {
  it("does not reject a visible hit merely because its unit is not rounded active", () => {
    expect(source).not.toContain("store.activeUnit !== unitIndex");
    expect(source).not.toContain(
      "useStacks.getState().activeUnit !== unitIndex",
    );
    expect(source).not.toContain("entry.unitIndex === state.activeUnit");
    expect(primitivesSource).not.toContain(
      "useStacks.getState().activeUnit !== linkUnit",
    );
    expect(objectsSource).not.toContain("activeUnit === linkUnit");
  });
});

describe("scene physics frame ownership", () => {
  it("steps once from a scene driver instead of from whichever prop renders first", () => {
    expect(source).not.toContain("shelf.tick(");
    expect(sceneSource).toContain("<PhysicsSceneFrameDriver />");
  });
});

describe("golf strike delivery", () => {
  it("launches through the authored path when lazy physics cannot take the strike", () => {
    const strikeStart = source.indexOf("function requestSceneStrike");
    const hooksStart = source.indexOf(
      'if (process.env.NODE_ENV !== "production"',
      strikeStart,
    );
    const strike = source.slice(strikeStart, hooksStart);

    expect(strike).toContain("if (!loaded) {");
    expect(strike).toContain("launchFallback();");
    expect(strike).toContain("prepared.world.strike(entry, velocity)");
    expect(strike).toContain("if (!finished) launchFallback();");
    expect(source).toContain('phase.current = "settling"');
    expect(source).toContain("authoredStrikeFloorY.current ??");
  });
});

describe("Grabbable tap/carry arbitration", () => {
  it("uses one stationary activation path for desktop and registered interactions", () => {
    const upStart = source.indexOf("const onGrabUp");
    const cancelStart = source.indexOf("const onGrabCancel", upStart);
    const registrationStart = source.indexOf("useEffect(() => {", cancelStart);
    const registrationEnd = source.indexOf(
      "useEffect(() => {",
      registrationStart + 1,
    );
    const up = source.slice(upStart, cancelStart);
    const registration = source.slice(registrationStart, registrationEnd);

    expect(up).toContain("runSceneInteractionActivation(hoverKey)");
    expect(registration).toContain("run: runStationaryActivation");
  });

  it("falls back to the stationary activation when the registry has none", () => {
    // A bare movable — a golf ball, a can carried into the bay — registers no
    // activation: its whole tap behaviour is the `hittable` fall-through
    // inside runStationaryActivation. Routing desktop taps only through the
    // registry silently disarmed every teed ball once (PR #31).
    const upStart = source.indexOf("const onGrabUp");
    const cancelStart = source.indexOf("const onGrabCancel", upStart);
    const up = source.slice(upStart, cancelStart);

    expect(up).toContain(
      "if (!runSceneInteractionActivation(hoverKey)) runStationaryActivation();",
    );
  });

  it("allows anchored props to advertise their authored hover reaction", () => {
    expect(source).toContain('hover: { kind: tiltOnHover ? "tilt" : "none" }');
    expect(source).not.toContain("draggable && tiltOnHover");
  });

  it("treats an exact authored angle as an overlapping composition", () => {
    expect(source).toContain("authoredAngle: hoverTiltAngle !== undefined");
  });

  it("does not enter physics until pointer travel crosses the carry threshold", () => {
    const downStart = source.indexOf("const onGrabDown");
    const moveStart = source.indexOf("const onGrabMove", downStart);
    const down = source.slice(downStart, moveStart);

    expect(downStart).toBeGreaterThanOrEqual(0);
    expect(moveStart).toBeGreaterThan(downStart);
    expect(down).not.toContain('phase.current = "held"');
    expect(down).not.toContain("prepareScenePhysics");
  });

  it("exposes the same movement threshold to anchored gesture effects", () => {
    const moveStart = source.indexOf("const onGrabMove");
    const moveEnd = source.indexOf("const onGrabUp", moveStart);
    const move = source.slice(moveStart, moveEnd);

    expect(source).toMatch(/onDragIntent\?:\s*\(\s*origin:/);
    expect(move).toContain("current.moved = true");
    expect(move).toContain("fireDragIntent();");
    expect(move.indexOf("current.moved = true")).toBeLessThan(
      move.indexOf("fireDragIntent();"),
    );
    // One helper serves both pointer paths: the fine pointer's move above
    // and the coarse arbiter's hand-off through the registry.
    expect(source).toMatch(
      /const fireDragIntent = useCallback\(\(\) => \{[\s\S]*?onDragIntentRef\.current\(\{ x: world\.x, y: world\.y, z: world\.z \}\);/,
    );
  });

  it("activates mounted physics after moving clear of the mount", () => {
    const releaseStart = source.indexOf("const release");
    const carryStart = source.indexOf("const beginCarry", releaseStart);
    const moveStart = source.indexOf("const onGrabDown", carryStart);
    const release = source.slice(releaseStart, carryStart);
    const carry = source.slice(carryStart, moveStart);
    const activationStart = carry.indexOf("const activateMountedPhysics");
    const detachStart = carry.indexOf("// Mounted props have no body");
    const activation = carry.slice(activationStart, detachStart);

    expect(carry).toContain('entry?.physicsActivation === "detach"');
    expect(carry).toContain("g.position.z += detachZ");
    expect(activation).toContain("entry.physicsActivated = true");
    expect(activation.indexOf("entry.physicsActivated = true")).toBeLessThan(
      activation.indexOf("physics.prepareScenePhysics"),
    );
    expect(carry.indexOf("g.position.z += detachZ")).toBeLessThan(
      carry.indexOf("activateMountedPhysics();", detachStart),
    );
    expect(release).not.toContain("physicsAfterPull");
    expect(source).not.toContain("fallbackRestY");
    expect(source).not.toContain("fallbackRestRotationX");
  });

  it("starts a mounted carry while physics is still loading", () => {
    const carryStart = source.indexOf("const beginCarry");
    const moveStart = source.indexOf("const onGrabDown", carryStart);
    const carry = source.slice(carryStart, moveStart);

    expect(carry).toContain("loadGrabbablePhysics().then");
    expect(carry.indexOf('phase.current = "held"')).toBeLessThan(
      carry.indexOf("loadGrabbablePhysics().then"),
    );
    expect(carry).toContain("mountedPhysicsPending.current = true");
  });
});
