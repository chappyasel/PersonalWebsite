import { readFileSync } from "node:fs";
import satori from "satori";
import { describe, expect, it } from "vitest";

import { BookOgByline } from "./BookOgByline";

const source = readFileSync(
  new URL("./opengraph-image.tsx", import.meta.url),
  "utf8",
);
const font = readFileSync(
  new URL("../../../../public/fonts/GeorgiaPro-Regular.ttf", import.meta.url),
);

type TextNode = { text: string; x: number; width: number };

function textNodes(svg: string): TextNode[] {
  return [
    ...svg.matchAll(
      /<text x="([^"]+)"[^>]*width="([^"]+)"[^>]*>([^<]*)<\/text>/g,
    ),
  ].map(([, x, width, text]) => ({
    text: text!,
    x: Number(x),
    width: Number(width),
  }));
}

async function renderByline(author: string) {
  return satori(
    <div style={{ display: "flex", flexDirection: "column", width: "720px" }}>
      <BookOgByline
        author={author}
        publicationYear={2002}
        color="rgba(255, 255, 255, 0.78)"
        separatorColor="rgba(255, 255, 255, 0.38)"
      />
    </div>,
    {
      width: 720,
      height: 80,
      embedFont: false,
      fonts: [
        {
          name: "Georgia Pro",
          data: font,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}

describe("book detail OG byline", () => {
  it("matches the cover height to a two-line detail stack", () => {
    expect(source).toContain('width: "307px"');
    expect(source).toContain('height: "460px"');
    expect(source).toContain('width="307"');
    expect(source).toContain('height="460"');
  });

  it("places the publication year directly beside a short author", async () => {
    const nodes = textNodes(await renderByline("Joseph Grenny"));
    const authorEnd = nodes.find((node) => node.text === "Grenny")!;
    const separator = nodes.find((node) => node.text === "•")!;

    const gap = separator.x - (authorEnd.x + authorEnd.width);
    expect(gap).toBeGreaterThanOrEqual(13);
    expect(gap).toBeLessThanOrEqual(16);
  });

  it("keeps the publication year visible when the author is long", async () => {
    const nodes = textNodes(
      await renderByline(
        "An Exceptionally Long Author Name That Must Yield Space to the Year",
      ),
    );
    const year = nodes.find((node) => node.text === "2002")!;

    expect(year.x + year.width).toBeLessThanOrEqual(720);
  });

  it("does not repeat the publication year as a fact row", () => {
    expect(source).not.toContain('label: "Published"');
  });
});
