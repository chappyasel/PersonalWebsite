// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  isInsideUniversalSearchMaterial,
  isUniversalSearchOpen,
  universalSearchFocusIntent,
} from "./overlay";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-universal-search-open");
});

describe("universal search overlay state", () => {
  it("tracks the document marker used by existing focus traps", () => {
    expect(isUniversalSearchOpen()).toBe(false);

    document.documentElement.setAttribute("data-universal-search-open", "true");
    expect(isUniversalSearchOpen()).toBe(true);

    document.documentElement.removeAttribute("data-universal-search-open");
    expect(isUniversalSearchOpen()).toBe(false);
  });
});

/** Mirrors the real palette: Radix's panel, cmdk's root and cmdk's list are all
 * `tabindex="-1"`, and the rows are plain divs with `role="option"`. */
function renderPalette() {
  document.body.innerHTML = `
    <button id="scene-control">Scene control</button>
    <div data-universal-search-material="" tabindex="-1" id="panel">
      <div cmdk-root="" tabindex="-1" id="root">
        <span id="magnifier"></span>
        <input id="search" aria-label="Universal Search" />
        <kbd id="esc-chip">ESC</kbd>
        <div cmdk-list="" tabindex="-1" id="list">
          <div cmdk-group-heading="" id="heading">Destinations</div>
          <div cmdk-item="" role="option" id="row">
            <span id="row-label">Books</span>
          </div>
        </div>
        <div id="footer"><span id="hint">Navigate with arrows</span></div>
      </div>
    </div>`;
  return (id: string) => document.getElementById(id);
}

describe("universalSearchFocusIntent", () => {
  it("keeps focus on the search input and on real controls", () => {
    const byId = renderPalette();

    expect(universalSearchFocusIntent(byId("search"))).toBe("keep");
  });

  it("reclaims focus from every tabindex=-1 wrapper a click can land on", () => {
    const byId = renderPalette();

    // Each of these focuses itself on mousedown in Chrome, which silently
    // takes keyboard focus away from the input while the palette still looks
    // focused: keydown fires, beforeinput never does, typing disappears.
    for (const id of ["panel", "root", "list"]) {
      expect(universalSearchFocusIntent(byId(id))).toBe("reclaim");
    }
  });

  it("reclaims focus from palette chrome that is not focusable at all", () => {
    const byId = renderPalette();

    for (const id of [
      "magnifier",
      "esc-chip",
      "heading",
      "row",
      "row-label",
      "footer",
      "hint",
    ]) {
      expect(universalSearchFocusIntent(byId(id))).toBe("reclaim");
    }
  });

  it("leaves anything outside the palette material alone", () => {
    const byId = renderPalette();

    expect(universalSearchFocusIntent(byId("scene-control"))).toBe("outside");
    expect(universalSearchFocusIntent(document.body)).toBe("outside");
    expect(universalSearchFocusIntent(null)).toBe("outside");
    expect(universalSearchFocusIntent(window)).toBe("outside");
  });

  it("treats every target inside the material as the palette's own event", () => {
    const byId = renderPalette();

    expect(isInsideUniversalSearchMaterial(byId("search"))).toBe(true);
    expect(isInsideUniversalSearchMaterial(byId("root"))).toBe(true);
    expect(isInsideUniversalSearchMaterial(byId("hint"))).toBe(true);
    expect(isInsideUniversalSearchMaterial(byId("scene-control"))).toBe(false);
  });
});
