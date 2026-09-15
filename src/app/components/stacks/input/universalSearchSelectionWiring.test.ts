import fs from "node:fs";

import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(new URL(relative, import.meta.url), "utf8");

const palette = read(
  "../../../../components/universal-search/UniversalSearchPalette.tsx",
);
const overlay = read("../../../../lib/universal-search/overlay.ts");
const bridges = read("./ScrollBridges.tsx");

/**
 * The room cannot tell a dismissal from a selection: both end with the palette
 * marker gone, and a selection whose destination never reaches the room's own
 * navigation — an external href, a command action — raises nothing else at all.
 * So the palette announces a choice on its own channel, BEFORE it closes.
 *
 * Behavioural tests drive that channel directly, which means they keep passing
 * if the palette stops calling it. This is the wiring guard for that gap.
 */
describe("universal search selection wiring", () => {
  it("announces a selection before closing, at every selecting path", () => {
    // recent, registry destination, search result, and the command ACTION path
    // that closes without navigating anywhere.
    const announcements = palette.match(/notifyUniversalSearchSelection\(\);/g);
    expect(announcements?.length).toBe(4);

    // Order matters, and a proximity window cannot express it: the command
    // ACTION path must announce before it RUNS the action, not merely before
    // it closes, or an action that throws never announces at all and the
    // dismissal behind it snaps the room back. Compare positions.
    const actionBranch = palette.slice(
      palette.indexOf('if (entry.kind === "action") {'),
      palette.indexOf("const href = resolveRegistryDestination"),
    );
    expect(actionBranch).not.toBe("");
    const announced = actionBranch.indexOf("notifyUniversalSearchSelection();");
    const ran = actionBranch.indexOf("runCommandAction(");
    const closed = actionBranch.indexOf("close();");
    expect(announced).toBeGreaterThanOrEqual(0);
    expect(announced).toBeLessThan(ran);
    expect(ran).toBeLessThan(closed);

    // The navigating paths announce while the palette still owns the turn.
    for (const site of palette.matchAll(/dependencies\.navigate\(/g)) {
      const before = palette.slice(0, site.index);
      expect(before.lastIndexOf("notifyUniversalSearchSelection();")).
        toBeGreaterThan(before.lastIndexOf("const select"));
    }
  });

  it("keeps the channel in the shared overlay module, not in Stacks internals", () => {
    expect(overlay).toContain("export function notifyUniversalSearchSelection");
    expect(overlay).toContain("export function onUniversalSearchSelection");
    expect(palette).not.toContain("app/components/stacks");
  });

  it("subscribes the room to it and cancels ownerless pending work", () => {
    expect(bridges).toContain("onUniversalSearchSelection(");
    // The takeover listener must not bail on a null owner: a gesture that has
    // already deferred owns nothing and still has a restoration to drop.
    expect(bridges).not.toContain("onRoomTakeover(() => {\n      if (!owner) return;");
  });
});
