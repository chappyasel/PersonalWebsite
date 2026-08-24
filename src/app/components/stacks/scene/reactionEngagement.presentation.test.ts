import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCENE = new URL(".", import.meta.url).pathname;

function source(file: string) {
  return fs.readFileSync(path.join(SCENE, file), "utf8");
}

function functionSource(text: string, start: string) {
  const from = text.indexOf(start);
  expect(from, `${start} is missing`).toBeGreaterThanOrEqual(0);
  const remaining = text.slice(from + start.length);
  const nextFunction = remaining.search(/^export function |^function /m);
  const to =
    nextFunction < 0 ? text.length : from + start.length + nextFunction;
  return text.slice(from, to);
}

describe("Touch Focus reaction wiring", () => {
  it("keeps a new press out of the generic Lift reaction", () => {
    const lift = source("Lift.tsx");
    expect(lift).toContain(
      "const lifted = propReactionIsEngaged(interaction, hoverKey);",
    );
    expect(lift).toContain(
      "const interactionState = (lifted ? 1 : 0) | (pressed ? 2 : 0);",
    );
    expect(lift).toContain("const ts = pressed ? 0.965 : lifted");
  });

  it("keeps the Grabbable Pickup Cue separate from its held reaction", () => {
    const grabbable = source("Grabbable.tsx");
    expect(grabbable).toContain(
      "propReactionIsEngaged(interactionState, hoverKey)",
    );
    expect(grabbable).not.toContain(
      "Math.abs(bandMotion.lean) * (pressed ? 1.25 : 1)",
    );
    expect(grabbable).toContain("const targetScale = pressed ? 0.965");
  });

  it("suppresses ModelProp's local hover channel with the shared free-roam gate", () => {
    expect(source("ModelProp.tsx")).toContain(
      "hovered.current && !propReactionsSuppressed()",
    );
  });

  it.each([
    ["globe spin", "eggs.tsx", "export function SpinProp"],
    ["basketball roll", "eggs.tsx", "export function RollProp"],
    ["alarm clock shiver", "eggs.tsx", "export function EggClock"],
    ["tea steam", "eggs.tsx", "export function SteamCup"],
    ["shaker slosh", "AuthoredProps.tsx", "export function ShakerProp"],
    ["trophy glint", "units/UnitProjects.tsx", "function Glint"],
    ["metal shimmer", "objects.tsx", "export function useMetalShimmer"],
    ["reading-book fan", "units/UnitAbout.tsx", "function ReadingBookHover"],
  ])("routes %s through the shared engagement rule", (_name, file, start) => {
    expect(functionSource(source(file), start)).toContain(
      "propReactionIsEngaged",
    );
  });
});
