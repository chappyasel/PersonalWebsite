import { describe, expect, it } from "vitest";

import { isPanelHistoryEntry } from "./store";

/**
 * The popstate that closes the mobile panel is the one that POPS its entry.
 * A pop that lands on it, from a sheet or the book modal closing above it,
 * carries the panel's stamp (with Next's internals folded in) and must not
 * close the panel.
 */
describe("isPanelHistoryEntry", () => {
  it("recognises the panel's stamp under Next's own keys", () => {
    expect(
      isPanelHistoryEntry({
        stacksPanel: true,
        __NA: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: [],
      }),
    ).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isPanelHistoryEntry(null)).toBe(false);
    expect(isPanelHistoryEntry(undefined)).toBe(false);
    expect(isPanelHistoryEntry({ __NA: true })).toBe(false);
    expect(isPanelHistoryEntry({ stacksPanel: false })).toBe(false);
    expect(isPanelHistoryEntry("stacksPanel")).toBe(false);
  });
});
