import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Interception is implicit: any soft navigation to a sheet route, from any
 * launcher under the slot's layout, mounts the sheet. So the phone-size
 * bypass in sheetRoute.ts only holds if every launcher goes through it —
 * `SheetLink` for links, `openSheetRoute` for pushes — and the sheet itself
 * keeps the net for the one that does not. Source assertions: the launchers
 * pull in the app router, tRPC and the 3D scene.
 */
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const LINK_LAUNCHERS = [
  "../../app/components/DocCard.tsx",
  "../../app/weightlifting/components/PersonalRecords.tsx",
  "../../app/weightlifting/components/WorkoutPreview.tsx",
];

const PUSH_LAUNCHERS = [
  "../../app/components/stacks/StacksCanvas.tsx",
  "../../app/components/stacks/scene/links.tsx",
  "../../app/weightlifting/components/YearCalendar.tsx",
  "../../app/weightlifting/[slug]/ExerciseExplorer.tsx",
];

/** The book modal opens from state and pushes its own history entry, so its
 * openers check BEFORE either: the shelf card, the shelf's Enter key, the
 * homepage bridge from the 3D store (covers, spines, #book- deep links), and
 * the books-host route interceptor a search jump lands on. */
const BOOK_MODAL_OPENERS = [
  "../../app/books/components/BookCard.tsx",
  "../../app/books/hooks/useKeyboardNavigation.ts",
  "../../app/components/stacks/modal/StacksBookModal.tsx",
  "../../app/books/@modal/(.)[bookId]/page.tsx",
];

describe("sheet launchers", () => {
  it.each(LINK_LAUNCHERS)("%s links through SheetLink", (path) => {
    const source = read(path);
    expect(source).toContain('from "~/components/modal-sheet/SheetLink"');
    expect(source).not.toContain('from "next/link"');
  });

  it.each(PUSH_LAUNCHERS)("%s pushes through openSheetRoute", (path) => {
    const source = read(path);
    expect(source).toContain("openSheetRoute(");
  });

  it.each(BOOK_MODAL_OPENERS)(
    "%s checks before opening the book modal",
    (path) => {
      expect(read(path)).toContain("loadFullPageOnSmallViewport(");
    },
  );

  it("keeps the sheet's own net for a launcher that skipped the check", () => {
    const sheet = read("./ModalSheet.tsx");
    expect(sheet).toContain("const [bypassed] = useState(prefersFullPage);");
    expect(sheet).toContain("window.location.replace(props.expandHref);");
    expect(sheet).toContain("if (bypassed) return null;");
  });

  it("keeps the book modal's net in its host", () => {
    const host = read("../../app/books/components/ModalHost.tsx");
    expect(host).toContain(
      "const bypassed = isModalOpen && fullPageHref !== null && prefersFullPage();",
    );
    expect(host).toContain("window.location.replace(fullPageHref);");
    expect(host).toContain("if (bypassed) return null;");
  });
});
