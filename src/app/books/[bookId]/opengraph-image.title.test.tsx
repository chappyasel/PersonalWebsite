import {
  Children,
  type ReactElement,
  type ReactNode,
  isValidElement,
} from "react";
import satori from "satori";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  element: null as ReactNode,
  title: "Disciplined Entrepreneurship",
}));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode) {
      captured.element = element;
    }
  },
}));
vi.mock("~/lib/books/ogDataAccess", () => ({
  getBookForOG: async () => ({
    title: captured.title,
    author: "Bill Aulet",
    coverUrl: null,
    coverColor: null,
    publicationYear: 2013,
    rating: null,
  }),
}));

function findTitle(node: ReactNode): ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === "h1") return child;
    const title = findTitle(child.props.children);
    if (title) return title;
  }
}

async function renderTitle(title: string) {
  captured.title = title;
  const { default: Image } = await import("./opengraph-image");
  const { loadGeorgiaProBold } = await import("./fonts");
  await Image({ params: Promise.resolve({ bookId: "title-test" }) });
  const heading = findTitle(captured.element);
  expect(heading).toBeDefined();
  return satori(
    <div style={{ display: "flex", flexDirection: "column", width: 713 }}>
      {heading}
    </div>,
    {
      width: 713,
      height: 240,
      embedFont: false,
      fonts: [
        {
          name: "Georgia Pro",
          data: await loadGeorgiaProBold(),
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}

describe("book OG title fitting", () => {
  it("keeps short titles at the full size", async () => {
    const svg = await renderTitle("Solaris");
    expect(svg).toContain('font-size="96"');
    expect(svg).not.toContain("…");
  });

  it("fits a longer title using the font and available width", async () => {
    const title = "The Art of Doing Science and Engineering";
    const svg = await renderTitle(title);
    const text = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
      .map((match) => match[1])
      .join("");
    expect(text.replace(/\s/g, "")).toBe(title.replace(/\s/g, ""));
    const baselines = [...svg.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(baselines).size).toBeLessThanOrEqual(2);
  });

  it("clamps exceptionally long titles only at the minimum size", async () => {
    const svg = await renderTitle(
      "An exceptionally long book title ".repeat(12),
    );
    expect(svg).toContain('font-size="48"');
    expect(svg).toContain("…");
    const baselines = [...svg.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(baselines).size).toBe(2);
  });

  it("shows Disciplined Entrepreneurship in full on two lines", async () => {
    const svg = await renderTitle("Disciplined Entrepreneurship");
    const text = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
      .map((match) => match[1])
      .filter((text) => text?.trim());
    expect(text).toEqual(["Disciplined", "Entrepreneurship"]);
  });
});
