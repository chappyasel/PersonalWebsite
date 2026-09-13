import { describe, expect, it } from "vitest";

import { parseMedium, richText } from "./medium";

function exported(
  body: string,
  footer = '<time class="dt-published" datetime="2023-11-12T16:53:47.507Z"></time>',
) {
  return `<article><h1 class="p-name">An essay</h1><section class="p-summary">A summary</section><section class="e-content">${body}</section><footer>${footer}<a class="p-canonical" href="https://medium.com/@chappyasel/an-essay-aaaaaaaaaaaa">Canonical</a></footer></article>`;
}
describe("Medium article import", () => {
  it("preserves original dates, emphasis, links, captions and list order", () => {
    const a = parseMedium(
      exported(
        '<h3 class="graf--title">An essay</h3><p>One <strong>bold <em>thought</em></strong> and <a href="https://example.com">link</a>.</p><ol><li>First</li><li>Second</li></ol><figure><img src="https://example.com/photo.jpg"><figcaption>A <em>caption</em></figcaption></figure>',
      ),
    )!;
    expect(a.publishedAt).toBe("2023-11-12T16:53:47.507Z");
    expect(a.slug).toBe("an-essay");
    expect(a.blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "numbered_list_item",
      "numbered_list_item",
      "image",
    ]);
    expect(a.blocks[0]).toMatchObject({
      paragraph: {
        rich_text: expect.arrayContaining([
          {
            type: "text",
            text: { content: "thought" },
            annotations: { bold: true, italic: true },
          },
        ]),
      },
    });
    expect(a.blocks[3]).toMatchObject({
      image: {
        caption: expect.arrayContaining([
          {
            type: "text",
            text: { content: "caption" },
            annotations: { italic: true },
          },
        ]),
      },
    });
  });
  it("excludes replies and undated drafts", () => {
    expect(parseMedium(exported("<p>Thanks for reading!</p>"))).toBeNull();
    expect(
      parseMedium(
        exported('<h3 class="graf--title">Draft</h3><p>Draft body</p>', ""),
      ),
    ).toBeNull();
  });
  it("flags a missing embed instead of treating the import as complete", () => {
    expect(
      parseMedium(
        exported(
          '<h3 class="graf--title">An essay</h3><figure id="missing" class="graf--iframe"></figure>',
        ),
      )!.missingEmbeds,
    ).toEqual(["missing"]);
  });
  it("preserves long Unicode text within Notion's per-run limit", () => {
    const input = "A🧠".repeat(2000);
    const runs = richText(input);
    expect(
      runs.every((r) => r.type === "text" && r.text.content.length <= 2000),
    ).toBe(true);
    expect(
      runs.map((r) => (r.type === "text" ? r.text.content : "")).join(""),
    ).toBe(input);
  });
});
