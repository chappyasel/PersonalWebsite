import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchNotesFromMarkdown } from "./notionNotes";

const { request, listChildren } = vi.hoisted(() => ({
  request: vi.fn(),
  listChildren: vi.fn(),
}));

vi.mock("~/env", () => ({ env: {} }));
vi.mock("./notionClient", () => ({
  createBookNotionClient: () => ({
    request,
    blocks: { children: { list: listChildren } },
    pages: { retrieve: vi.fn() },
  }),
}));
vi.mock("./noteImages", () => ({
  persistImages: (markdown: string) => Promise.resolve(markdown),
}));

type Block = {
  id: string;
  type: string;
  has_children: boolean;
  [type: string]: unknown;
};

function item(
  id: string,
  richText: object[],
  overrides: Partial<Block> = {},
): Block {
  return {
    id,
    type: "bulleted_list_item",
    has_children: false,
    bulleted_list_item: { rich_text: richText },
    ...overrides,
  };
}

const linkMention = (href: string) => ({
  type: "mention",
  mention: { type: "link_mention" },
  href,
});
const wordLink = (href: string) => ({ type: "text", href });

/** Serve the page's markdown, and each parent's children from `tree`. */
function servePage(markdown: string, tree: Record<string, Block[]>) {
  request.mockResolvedValue({
    markdown,
    truncated: false,
    unknown_block_ids: [],
  });
  listChildren.mockImplementation(({ block_id }: { block_id: string }) =>
    Promise.resolve({ results: tree[block_id] ?? [], next_cursor: null }),
  );
}

beforeEach(() => {
  request.mockReset();
  listChildren.mockReset();
});

describe("fetchNotesFromMarkdown", () => {
  it("numbers a resumed list and marks link mentions from one walk of the blocks", async () => {
    servePage(
      [
        "1. First",
        "- Bullet",
        "1. Resumed",
        "- *Website: *[*Read — Plurality*](https://plurality.net/read/)",
        "- Further reading",
        "\t- [Gresham's law](https://en.wikipedia.org/wiki/Gresham)",
        "\t- Eg. [World Cafe Method](https://theworldcafe.com/method/)",
      ].join("\n"),
      {
        page: [
          item("first", []),
          item("bullet", []),
          {
            id: "resumed",
            type: "numbered_list_item",
            has_children: false,
            numbered_list_item: { list_start_index: 2, rich_text: [] },
          },
          item("website", [
            { type: "text" },
            linkMention("https://plurality.net/read/"),
          ]),
          item("further", [], { has_children: true }),
        ],
        further: [
          item("gresham", [
            linkMention("https://en.wikipedia.org/wiki/Gresham"),
          ]),
          item("cafe", [wordLink("https://theworldcafe.com/method/")]),
        ],
      },
    );

    const notes = await fetchNotesFromMarkdown("page");

    expect(notes?.split("\n")).toEqual([
      "1. First",
      "- Bullet",
      "2. Resumed",
      '- *Website:* [*Read — Plurality*](https://plurality.net/read/ "@")',
      "- Further reading",
      '    - [Gresham\'s law](https://en.wikipedia.org/wiki/Gresham "@")',
      "    - Eg. [World Cafe Method](https://theworldcafe.com/method/)",
    ]);
    // The page's children are read once for all four paths, and the only
    // other parent read is the one two of those paths go through.
    expect(
      listChildren.mock.calls.map(
        (call) => (call[0] as { block_id: string }).block_id,
      ),
    ).toEqual(["page", "further"]);
  });

  it("leaves a link unmarked when its path runs past the blocks Notion returns", async () => {
    servePage(
      [
        "- Parent Notion says has no children",
        "\t- [Read](https://plurality.net/read/)",
        "- [Gresham's law](https://en.wikipedia.org/wiki/Gresham)",
      ].join("\n"),
      {
        // The second block is missing, and the first has no children.
        page: [item("parent", [])],
        parent: [item("read", [linkMention("https://plurality.net/read/")])],
      },
    );

    const notes = await fetchNotesFromMarkdown("page");

    expect(notes).toBe(
      [
        "- Parent Notion says has no children",
        "    - [Read](https://plurality.net/read/)",
        "- [Gresham's law](https://en.wikipedia.org/wiki/Gresham)",
      ].join("\n"),
    );
    expect(notes).not.toContain('"@"');
    // A block without children is never asked for them.
    expect(listChildren).toHaveBeenCalledTimes(1);
  });
});
