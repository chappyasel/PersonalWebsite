import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LinkPreview } from "~/lib/books/linkPreview";

import LinkMention from "./LinkMention";

function githubPreview(file: string | null): LinkPreview {
  return {
    site: "GitHub",
    title: file ?? "mgp/book-notes",
    description: "Notes on books",
    icon: null,
    iconTone: null,
    image: null,
    github: { owner: "mgp", repo: "book-notes", file, avatar: null },
  };
}

describe("LinkMention", () => {
  it("draws GitHub as its own path behind GitHub's mark, with a card on hover", () => {
    const repo = renderToStaticMarkup(
      <LinkMention
        href="https://github.com/mgp/book-notes"
        preview={githubPreview(null)}
      />,
    );
    const file = renderToStaticMarkup(
      <LinkMention
        href="https://github.com/mgp/book-notes/blob/master/talk-like-ted.markdown"
        preview={githubPreview("talk-like-ted.markdown")}
      />,
    );

    // The owner's path ends in a slash and sits against the title, with no
    // gap, after GitHub's mark in the text colour rather than a site icon.
    expect(repo).toMatch(
      /<svg[^>]*class="[^"]*text-foreground"[^>]*>.*?<\/svg><span class="text-muted-foreground\/85">mgp\/<\/span><\/span><span class="underline[^"]*">book-notes<\/span>/,
    );
    expect(file).toMatch(
      /<span class="text-muted-foreground\/85">mgp\/book-notes\/<\/span><\/span><span class="underline[^"]*">talk-like-ted\.markdown<\/span>/,
    );
    expect(repo).not.toContain("<img");
    // The link is the trigger for the hover card.
    expect(repo).toMatch(/<a [^>]*data-state="closed"/);
  });

  it("shows the tidied address with a globe and no card without a preview", () => {
    const markup = renderToStaticMarkup(
      <LinkMention
        href="https://www.navalmanack.com/navals%20recommended%20reading/"
        emphasis
      />,
    );

    // The globe stays on one line with the first word, never alone at the
    // end of a line, and the italics the owner gave the link carry over.
    expect(markup).toMatch(
      /^<a href="https:\/\/www\.navalmanack\.com\/navals%20recommended%20reading\/" class="[^"]*"><em><span class="whitespace-nowrap"><svg[^>]*class="[^"]*text-muted-foreground"[^>]*>.*?<\/svg><span class="underline[^"]*">navalmanack\.com\/navals<\/span><\/span><span class="underline[^"]*"> recommended reading<\/span><\/em><\/a>$/,
    );
    expect(markup).not.toContain("data-state");
  });
});
