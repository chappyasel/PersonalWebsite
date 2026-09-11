import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BooksBootPrototype from "./BooksBootPrototype";

const markup = renderToStaticMarkup(
  <BooksBootPrototype
    featuredBooks={[
      {
        id: "boot-book",
        title: "A real cover",
        author: "Author",
        coverUrl: "https://example.com/cover.jpg",
        pageCount: 320,
        audioLengthMin: null,
      },
    ]}
    spineBooks={[]}
  />,
);

describe("Books boot first paint", () => {
  it("renders both themes and featured artwork without a browser or a running scene", () => {
    expect(markup).toContain('class="books-boot-light"');
    expect(markup).toContain('class="books-boot-dark"');
    expect(markup).toContain('data-shelf-cover="boot-book"');
    expect(markup).toContain("Opening the Books shelf");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("<canvas");
  });

  it.each([
    ["/", "#books", "?transitionPrototype=1&variant=bookshelf", true],
    ["/", "#about", "?transitionPrototype=1&variant=bookshelf", false],
    ["/", "#books", "?transitionPrototype=1&variant=shutters", false],
    ["/", "#books", "", false],
    ["/", "#about", "", false],
    ["/books", "#books", "?transitionPrototype=1&variant=bookshelf", false],
  ])("selects %s%s %s before hydration", (pathname, hash, search, selected) => {
    const attrs = new Map([["data-books-boot", "stale"]]);
    const document = {
      documentElement: {
        setAttribute: (key: string, value: string) => attrs.set(key, value),
        removeAttribute: (key: string) => attrs.delete(key),
      },
    };
    const script = /<script>([\s\S]*?)<\/script>/.exec(markup)?.[1];
    expect(script).toBeTruthy();
    runInNewContext(script!, {
      location: { pathname, hash, search },
      document,
      URLSearchParams,
    });
    expect(attrs.has("data-books-boot")).toBe(selected);
  });
});
