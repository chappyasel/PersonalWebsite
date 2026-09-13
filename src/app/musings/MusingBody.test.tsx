// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { musings } from "~/lib/musings/content";

import { MusingBody } from "./MusingBody";

afterEach(cleanup);

describe("imported link previews", () => {
  const previews = musings.flatMap((article) =>
    article.blocks.filter(
      (block) =>
        block.type === "paragraph" &&
        block.content.length === 4 &&
        block.content[1]?.text === "\n" &&
        block.content[3]?.link,
    ),
  );

  it.each(previews)(
    "renders one title link and a separate description: %j",
    (block) => {
      if (block.type !== "paragraph") throw new Error("Expected paragraph");
      const view = render(<MusingBody blocks={[block]} />);
      const links = view.getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]?.getAttribute("href")).toBe(block.content[0]?.link);
      expect(links[0]?.textContent).toContain(block.content[0]?.text);
      const description = view.getByText(block.content[2]!.text);
      expect(description.closest("a")).toBeNull();
      expect(view.queryByText(block.content[3]!.text)).toBeNull();
    },
  );

  it("preserves ordinary prose with multiple links", () => {
    const view = render(
      <MusingBody
        blocks={[
          {
            type: "paragraph",
            content: [
              { text: "Read " },
              { text: "this essay", link: "https://example.com/essay" },
              { text: " and " },
              { text: "this book", link: "https://example.com/book" },
              { text: "." },
            ],
          },
        ]}
      />,
    );
    expect(view.getAllByRole("link")).toHaveLength(2);
    expect(view.container.textContent).toBe("Read this essay and this book.");
  });
});
