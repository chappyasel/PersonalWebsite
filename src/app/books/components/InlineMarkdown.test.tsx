import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InlineMarkdown } from "./InlineMarkdown";

function renderInline(source: string) {
  return renderToStaticMarkup(<InlineMarkdown source={source} />);
}

describe("InlineMarkdown", () => {
  it.each([
    ["**bold** text", "<strong>bold</strong> text"],
    ["_italic_ text", "<em>italic</em> text"],
    ["***bold italic***", "<em><strong>bold italic</strong></em>"],
    [
      "**bold with _nested italic_**",
      "<strong>bold with <em>nested italic</em></strong>",
    ],
    ["`code * literal`", "<code>code * literal</code>"],
    [
      "[linked text](https://example.com)",
      '<a href="https://example.com">linked text</a>',
    ],
    ["~~strikethrough~~", "<del>strikethrough</del>"],
    ["\\*literal asterisks\\*", "*literal asterisks*"],
    ["2 * 3 * 4", "2 * 3 * 4"],
  ])("renders %s as inline markup", (source, expected) => {
    expect(renderInline(source)).toBe(expected);
  });

  it("preserves whitespace around Markdown split by raw HTML children", () => {
    expect(renderInline(" **bold** ")).toBe(" <strong>bold</strong> ");
  });

  it("does not render raw HTML", () => {
    expect(renderInline("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("does not treat a single tilde as strikethrough", () => {
    expect(renderInline("~approximate~")).toBe("~approximate~");
  });
});
