import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Backdrop dismissal has to stay anchored to where the press STARTED.
 *
 * A `click` is dispatched to the nearest common ancestor of the press and the
 * release, so a bare `onClick={close}` on the backdrop closes the surface for
 * any click React routes there — including one that began on something inside
 * the dialog which then unmounted under the pointer (a section collapsing, a
 * toggle's exit animation), and a text selection that drifts past the card's
 * edge. Arming on `pointerdown` and checking the shell is what makes only a
 * press that began outside able to dismiss.
 *
 * Source assertions rather than a mounted test: both surfaces pull in the app
 * router, framer's WAAPI entrance and a live tRPC query, and the invariant
 * being protected is one line in each file.
 */
const SHEET = readFileSync(new URL("./ModalSheet.tsx", import.meta.url), "utf8");
const BOOK_MODAL = readFileSync(
  new URL("../../app/books/components/Modal.tsx", import.meta.url),
  "utf8",
);

describe.each([
  ["the sheet", SHEET],
  ["the book modal", BOOK_MODAL],
])("%s", (_name, source) => {
  it("arms dismissal on pointerdown and releases it on the click", () => {
    expect(source).toContain("onPointerDown={armDismiss}");
    expect(source).toContain("onClick={dismissIfArmed}");
    expect(source).toContain("dismissArmedRef.current = false;");
  });

  it("decides by whether the press landed inside the dialog shell", () => {
    expect(source).toContain(
      "dismissArmedRef.current = !(\n      target instanceof Node && shellRef.current?.contains(target)\n    );",
    );
  });

  // The regression this guards is specifically a FULL-VIEWPORT dismissal
  // surface wired straight to close. A close BUTTON calling close is the
  // point of a close button, and an earlier version of this test matched
  // both — it went red the first time someone added a `<SheetCloseControl
  // onClick={handleClose} />` to a loading skeleton, which is correct code.
  // So the check is scoped to elements that carry `inset-0`.
  it("never wires close straight to a full-viewport surface again", () => {
    const offenders = [...source.matchAll(/inset-0/g)]
      .map((match) => source.slice(match.index, match.index + 400))
      .filter((block) => /onClick=\{(close|handleClose)\}/.test(block))
      // The armed handler may appear in the same window as the class; only a
      // BARE close on that element is the bug.
      .filter((block) => !block.includes("onClick={dismissIfArmed}"));
    expect(offenders).toEqual([]);
  });
});
