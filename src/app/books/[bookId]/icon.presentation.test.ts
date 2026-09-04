import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./icon.tsx", import.meta.url), "utf8");
const composition = readFileSync(
  new URL("../bookCoverIcon.tsx", import.meta.url),
  "utf8",
);
const libraryIcon = readFileSync(
  new URL("../icon.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);

describe("book favicon composition", () => {
  it("shows the whole cover instead of a square crop", () => {
    expect(composition).toContain("fitCoverInFrame(coverDimensions, frame, inset)");
    expect(composition).toMatch(
      /width: `\$\{cover\.width\}px`,\s*height: `\$\{cover\.height\}px`/,
    );
    expect(composition).not.toMatch(/width="32"/);
  });

  it("lays the cover over a blurred, tinted copy of itself like the OG card", () => {
    expect(composition).toMatch(
      /objectFit: "cover",\s*filter: `blur\(\$\{backdropBlur\}px\)`,\s*transform: `scale\(\$\{backdropScale\}\)`/,
    );
    expect(composition).toContain("backgroundColor: overlayColor");
    expect(composition).toContain("getTextColorAndOverlay(");
  });

  it("is what the book page draws, while the library root keeps the family icon", () => {
    expect(source).toContain("bookCoverIconImage(book, ICON_FRAME)");
    expect(libraryIcon).toContain("siteIconImage(id, SECTION_ICONS.books)");
    expect(libraryIcon).not.toContain("bookCoverIconImage");
  });

  it("is linked by an absolute books-host href so /books/:id pages find it", () => {
    expect(pageSource).toContain("icon: `${getBooksOrigin()}/${bookId}/icon`");
    expect(pageSource).not.toContain("icon: `/${bookId}/icon`");
  });

  it("caches per book like the OG card", () => {
    expect(source).toContain('export const dynamic = "force-static"');
    expect(source).toContain("export const revalidate = false");
  });
});
