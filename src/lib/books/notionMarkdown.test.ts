import { describe, expect, it } from "vitest";

import { convertNotionMarkdown, mentionedPageUrls } from "./notionMarkdown";

const convert = (markdown: string) => convertNotionMarkdown(markdown).markdown;

describe("block layout", () => {
  it("separates blocks with blank lines so quotes and paragraphs stay apart", () => {
    expect(convert("# Summary\nFirst.\nSecond.\n> *“One”*\n> *“Two”*")).toBe(
      "# Summary\n\nFirst.\n\nSecond.\n\n> *“One”*\n\n> *“Two”*",
    );
  });

  it("keeps list items tight and nests them four spaces deep", () => {
    expect(convert("- a\n\t- b\n\t\t- c\n\t1. d\n\t- e\n- f")).toBe(
      "- a\n    - b\n        - c\n    1. d\n    - e\n- f",
    );
  });

  it("writes toggles with their children at the toggle's level", () => {
    expect(
      convert(
        "<details>\n<summary>A **point**</summary>\n\t- detail\n\t\t- more\n</details>",
      ),
    ).toBe(
      "<details>\n<summary>A **point**</summary>\n- detail\n    - more\n\n</details>",
    );
  });

  it("turns toggle headings into toggles with a bold summary", () => {
    expect(convert('### **More Quotes** {toggle="true"}\n\t> *“Q”*')).toBe(
      "<details>\n<summary><strong>More Quotes</strong></summary>\n> *“Q”*\n\n</details>",
    );
  });

  it("shows an empty toggle's summary instead of dropping it", () => {
    expect(
      convert(
        "<details>\n<summary>The **banking system**</summary>\n</details>",
      ),
    ).toBe("The **banking system**");
  });

  it("drops empty blocks and colour spans, and flattens columns", () => {
    expect(
      convert(
        '- <span color="red_bg">Lick</span>\n<empty-block/>\n<columns>\n\t<column ratio="50">\n\t\tLeft\n\t</column>\n\t<column>\n\t\tRight\n\t</column>\n</columns>',
      ),
    ).toBe("- Lick\n\nLeft\n\nRight");
  });

  it("moves a paragraph's indented children out of code-block territory", () => {
    expect(convert("Intro\n\t- child")).toBe("Intro\n\n- child");
  });
});

describe("line breaks", () => {
  it("splits a paragraph at a double break and keeps single breaks", () => {
    expect(convert("One.<br><br>Two.<br>Three.")).toBe(
      "One.\n\nTwo.<br>Three.",
    );
  });

  it("keeps a quote's attribution on its own line inside the quote", () => {
    expect(convert("> *“Quote”*<br>- Viktor Frankl")).toBe(
      "> *“Quote”*<br>- Viktor Frankl",
    );
  });

  it("drops a trailing break and an italic break Notion marks with underscores", () => {
    expect(convert("- doubted_<br>_\n- **Post-IPO**<br>")).toBe(
      "- doubted\n- **Post-IPO**",
    );
  });
});

describe("emphasis", () => {
  it("moves spaces out of bold and italic runs", () => {
    expect(
      convert("**35: Golden escalator **\n- *“Bad laws” *limit rules"),
    ).toBe("**35: Golden escalator** \n\n- *“Bad laws”* limit rules");
  });

  it("separates a bold run from the italic run that touches it", () => {
    expect(convert("- **Wise***: “patient” *")).toBe(
      "- **Wise**_: “patient”_ ",
    );
  });

  it("keeps bold nested in italics", () => {
    expect(convert("- *“Imitation is **not** at the heart” *- eg.")).toBe(
      "- *“Imitation is* ***not*** *at the heart”* - eg.",
    );
  });

  it("leaves escaped asterisks as text", () => {
    expect(convert("Resistance \\* pain")).toBe("Resistance \\* pain");
  });
});

describe("links", () => {
  it("titles page mentions and lists them for lookup", () => {
    const markdown =
      'See <mention-page url="https://app.notion.com/p/2eabbe17dbff400ca00fdea006f1bd84"/>.';
    expect(mentionedPageUrls(markdown)).toEqual([
      "https://app.notion.com/p/2eabbe17dbff400ca00fdea006f1bd84",
    ]);
    expect(
      convertNotionMarkdown(markdown, { titleOf: () => "Life 3.0" }).markdown,
    ).toBe(
      "See [Life 3.0](https://app.notion.com/p/2eabbe17dbff400ca00fdea006f1bd84).",
    );
  });

  it("names images and files after their files", () => {
    const file = encodeURIComponent(
      JSON.stringify({ source: "https://files.example/bk_hach.pdf?sig=1" }),
    );
    expect(
      convert(
        `![](https://files.example/Shackled.jpeg?sig=1)\n<file src="file://${file}"></file>`,
      ),
    ).toBe(
      "![Shackled.jpeg](https://files.example/Shackled.jpeg?sig=1)\n\n[bk_hach.pdf](https://files.example/bk_hach.pdf?sig=1)",
    );
  });

  it("reports tags it does not know", () => {
    expect(
      convertNotionMarkdown('<mention-date start="2026-01-01"/>').unsupported,
    ).toEqual(["mention-date"]);
  });
});

describe("numbered lists", () => {
  const list =
    "1. Tell your origin story\n\t1. Personal\n- Serve it up\n1. Share recruiting\n- Nudge\n1. Shareable moments\n2. Role models\n**Next**\n1. Badges";

  it("reports each item that resumes a list after other blocks", () => {
    expect(convertNotionMarkdown(list).resumedListPaths).toEqual([
      "2",
      "4",
      "7",
    ]);
  });

  it("numbers resumed items as Notion does and counts on from there", () => {
    const starts = new Map([
      ["2", 2],
      ["4", 3],
    ]);
    expect(
      convertNotionMarkdown(list, { listStartAt: (path) => starts.get(path) })
        .markdown,
    ).toBe(
      "1. Tell your origin story\n    1. Personal\n- Serve it up\n2. Share recruiting\n- Nudge\n3. Shareable moments\n4. Role models\n\n**Next**\n\n1. Badges",
    );
  });

  it("finds resumed items inside toggles by their sibling path", () => {
    expect(
      convertNotionMarkdown(
        "Intro\n<details>\n<summary>S</summary>\n\t1. a\n\t- b\n\t1. c\n</details>",
      ).resumedListPaths,
    ).toEqual(["1/2"]);
  });
});
