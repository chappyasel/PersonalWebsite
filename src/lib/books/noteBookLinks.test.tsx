import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";

import { rehypeBookHeadingAnchors } from "./headingAnchors";
import { renderableNotes, withoutPlaceholders } from "./markdown";
import { type NoteBookLink, bookLinksInNotes } from "./noteBookLinks";

/** The ids the book page renders for these notes. */
function renderedIds(notes: string): string[] {
  const html = renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeBookHeadingAnchors]}
    >
      {renderableNotes(withoutPlaceholders(notes))}
    </ReactMarkdown>,
  );
  return [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);
}

const BOWLING = "https://app.notion.com/p/16ac5ab0d88d80c4817dfcfcecc47e80";
const GENE = "https://app.notion.com/p/12ed89f9a17a4df48ed2a276cc4e8956";
const resolve = (href: string) =>
  href === BOWLING
    ? "bowling-alone"
    : href === GENE
      ? "the-selfish-gene"
      : null;

// The excerpt as a reader sees it, the link's words in brackets.
const shown = (link: NoteBookLink) =>
  link.excerpt
    .map((segment) => (segment.match ? `[${segment.text}]` : segment.text))
    .join("");

const links = (lines: string[]) => bookLinksInNotes(lines.join("\n"), resolve);

describe("bookLinksInNotes", () => {
  it("finds each linked book once, at its first link, with its chapter", () => {
    const notes = [
      "# **Notes**",
      "",
      "**10: The Evolution of Behavior**",
      "",
      `- Natural selection favours genes, as in [The Selfish Gene](${GENE})`,
      "",
      "**11: Culture**",
      "",
      `- Again: [The Selfish Gene](${GENE})`,
      `- Trust is falling ([Bowling Alone](${BOWLING}))`,
      "- [Wikipedia](https://en.wikipedia.org/wiki/Trust)",
    ].join("\n");
    const found = bookLinksInNotes(notes, resolve);
    expect(found.map((link) => [link.bookId, link.text, shown(link)])).toEqual([
      [
        "the-selfish-gene",
        "The Selfish Gene",
        "Natural selection favours genes, as in [The Selfish Gene]",
      ],
      ["bowling-alone", "Bowling Alone", "Trust is falling ([Bowling Alone])"],
    ]);
    const ids = renderedIds(notes);
    for (const link of found) expect(ids).toContain(link.anchor);
    expect(found[0]!.anchor).not.toBe(found[1]!.anchor);
  });

  it("gives a link alone in its bullet the point it stands under", () => {
    const [link] = links([
      "- Strongest predictor of happiness: obligation to others",
      `    - [Bowling Alone](${BOWLING})`,
    ]);
    expect(shown(link!)).toBe(
      "Strongest predictor of happiness: obligation to others · [Bowling Alone]",
    );
  });

  it("else the comment under it", () => {
    const [link] = links([
      "- **Ecosystem**: a supermind with no coordinated decision making",
      `- [Bowling Alone](${BOWLING})`,
      "    - Markets are controlling more time and communities less",
    ]);
    expect(shown(link!)).toBe(
      "[Bowling Alone] · Markets are controlling more time and communities less",
    );
  });

  it("else the point before it, or after it", () => {
    expect(
      shown(
        links([
          "- Natural selection based on ability to reproduce",
          `- [The Selfish Gene](${GENE})`,
        ])[0]!,
      ),
    ).toBe(
      "Natural selection based on ability to reproduce · [The Selfish Gene]",
    );
    expect(
      shown(links([`- [The Selfish Gene](${GENE})`, "- Kin selection"])[0]!),
    ).toBe("[The Selfish Gene] · Kin selection");
  });

  it("keeps the link on screen in a long line", () => {
    const [link] = links([
      `- ${"Society has spent decades turning away from every kind of club and league, ".repeat(2)}see [Bowling Alone](${BOWLING}) ${"for the long version of the argument and its data. ".repeat(6)}`,
    ]);
    const [lead, mark, rest] = link!.excerpt;
    expect(lead!.text.startsWith("…")).toBe(true);
    expect(lead!.text.length).toBeLessThanOrEqual(121);
    expect(mark).toEqual({ text: "Bowling Alone", match: true });
    expect(rest!.text.endsWith("…")).toBe(true);
    expect(shown(link!).length).toBeLessThan(250);
  });

  it("ignores links to pages that are not library books", () => {
    expect(
      links(["- [Extreme programming](https://en.wikipedia.org/wiki/XP)"]),
    ).toEqual([]);
  });
});
