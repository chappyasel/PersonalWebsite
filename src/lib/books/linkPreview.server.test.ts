import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  iconTone,
  imageFromIco,
  isPublicAddress,
  linkPreviewsFor,
  noteLinks,
  parseHead,
  unfurl,
} from "./linkPreview.server";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
// Hosts ending .internal resolve to a private address, the rest to a public
// one, so no test touches real DNS.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn((host: string) =>
    Promise.resolve([
      {
        address: host.endsWith(".internal") ? "10.0.0.7" : "93.184.216.34",
        family: 4,
      },
    ]),
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseHead", () => {
  it("reads Open Graph first and ranks icons sharpest first", () => {
    const head = parseHead(
      `<html><head>
        <title>Fallback &amp; title</title>
        <meta property="og:title" content="Read &#8212; Plurality">
        <meta property="og:site_name" content="Plurality">
        <meta name="description" content="A book about &quot;plurality&quot;.">
        <meta property="og:image" content="/assets/og.jpg">
        <link rel="icon" href="/favicon-16.png" sizes="16x16">
        <link rel="shortcut icon" href="/favicon.png">
        <link rel="apple-touch-icon" href="/touch.png">
      </head><body><meta property="og:title" content="Not the head"></body>`,
      "https://plurality.net/read/",
    );
    expect(head).toEqual({
      title: "Read — Plurality",
      site: "Plurality",
      description: 'A book about "plurality".',
      image: "https://plurality.net/assets/og.jpg",
      icons: [
        "https://plurality.net/touch.png",
        "https://plurality.net/favicon-16.png",
        "https://plurality.net/favicon.png",
        "https://plurality.net/favicon.ico",
      ],
    });
  });

  it("falls back to the title tag and the browser's favicon", () => {
    expect(
      parseHead(
        "<head><title>\n  Gresham's law - Wikipedia\n</title></head>",
        "https://en.wikipedia.org/wiki/Gresham",
      ),
    ).toMatchObject({
      title: "Gresham's law - Wikipedia",
      site: null,
      icons: ["https://en.wikipedia.org/favicon.ico"],
    });
  });

  it("clips a page's words and drops what could reorder them", () => {
    const head = parseHead(
      `<head><meta property="og:title" content="Safe\u202e title">
        <meta property="og:description" content="${"word ".repeat(200)}">
        <meta property="og:image" content="http://example.com/og.png"></head>`,
      "https://example.com/",
    );
    expect(head.title).toBe("Safe title");
    expect(head.description).toHaveLength(300);
    expect(head.description?.endsWith("…")).toBe(true);
    // The card only loads https images.
    expect(head.image).toBeNull();
    // An SVG would pass through the optimizer to the reader untouched.
    expect(
      parseHead(
        '<head><meta property="og:image" content="https://example.com/card.svg?v=2"></head>',
        "https://example.com/",
      ).image,
    ).toBeNull();
  });

  it("parses a hostile head in one pass", () => {
    for (const page of [
      `<head><meta ${"a".repeat(200_000)}></head>`,
      `<head>${"<meta ".repeat(40_000)}</head>`,
      `<head>${"<title>".repeat(40_000)}</head>`,
      `<head>${'<meta content="x" '.repeat(20_000)}`,
    ]) {
      const start = performance.now();
      parseHead(page, "https://example.com/");
      expect(performance.now() - start).toBeLessThan(250);
    }
  });
});

describe("isPublicAddress", () => {
  it("refuses loopback, private, link-local and mapped addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::ffff:7f00:1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
  });
});

/** An .ico holding one 2×2 32-bit bitmap: red, green / blue, clear. */
function bitmapIco(): Uint8Array {
  const width = 2;
  const height = 2;
  const header = 40;
  const pixels = width * height * 4;
  const mask = 4 * height;
  const image = new Uint8Array(header + pixels + mask);
  const view = new DataView(image.buffer);
  view.setUint32(0, header, true);
  view.setInt32(4, width, true);
  view.setInt32(8, height * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  // Bottom row first, in BGRA: blue, clear; then the top row: red, green.
  image.set([255, 0, 0, 255, 0, 0, 0, 0], header);
  image.set([0, 0, 255, 255, 0, 255, 0, 255], header + 8);
  const ico = new Uint8Array(6 + 16 + image.length);
  const icoView = new DataView(ico.buffer);
  icoView.setUint16(2, 1, true);
  icoView.setUint16(4, 1, true);
  ico[6] = width;
  ico[7] = height;
  icoView.setUint32(6 + 8, image.length, true);
  icoView.setUint32(6 + 12, 22, true);
  ico.set(image, 22);
  return ico;
}

describe("imageFromIco", () => {
  it("reads a 32-bit bitmap top down in RGBA", () => {
    expect(imageFromIco(bitmapIco())).toEqual({
      kind: "rgba",
      width: 2,
      height: 2,
      data: new Uint8Array([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
      ]),
    });
  });

  it("is null for anything that is not an icon", () => {
    expect(imageFromIco(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

function icon(
  size: number,
  paint: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) rgba.set(paint(x, y), (y * size + x) * 4);
  return rgba;
}

describe("iconTone", () => {
  const inner = (x: number, y: number) => x > 8 && x < 24 && y > 8 && y < 24;

  it("finds a dark glyph and a dark tile", () => {
    const glyph = icon(32, (x, y) =>
      inner(x, y) ? [20, 20, 20, 255] : [0, 0, 0, 0],
    );
    const tile = icon(32, (x, y) =>
      inner(x, y) ? [240, 80, 80, 255] : [15, 20, 35, 255],
    );
    expect(iconTone(glyph, 32, 32)).toBe("dark-glyph");
    expect(iconTone(tile, 32, 32)).toBe("dark-tile");
  });

  it("finds light ones too, and leaves coloured icons alone", () => {
    const glyph = icon(32, (x, y) =>
      inner(x, y) ? [250, 250, 250, 255] : [0, 0, 0, 0],
    );
    const tile = icon(32, () => [255, 255, 255, 255]);
    const coloured = icon(32, (x, y) =>
      inner(x, y) ? [30, 140, 230, 255] : [0, 0, 0, 0],
    );
    expect(iconTone(glyph, 32, 32)).toBe("light-glyph");
    expect(iconTone(tile, 32, 32)).toBe("light-tile");
    expect(iconTone(coloured, 32, 32)).toBeNull();
  });
});

describe("linkPreviewsFor", () => {
  it("fetches only link mentions and pasted addresses", async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        fetched.push(url);
        if (url === "https://plurality.net/read/") {
          return Promise.resolve(
            new Response(
              '<head><meta property="og:title" content="Read — Plurality"><meta property="og:site_name" content="Plurality"></head>',
              { headers: { "content-type": "text/html" } },
            ),
          );
        }
        return Promise.resolve(new Response("", { status: 404 }));
      }),
    );

    const previews = await linkPreviewsFor(
      [
        '- *Website:* [*Read — Plurality*](https://plurality.net/read/ "@")',
        "- [https://www.navalmanack.com/reading](https://www.navalmanack.com/reading)",
        "- Eg. [World Cafe Method](https://theworldcafe.com/method/)",
        "- ![photo](https://example.com/photo.png)",
      ].join("\n"),
    );

    expect(Object.keys(previews)).toEqual(["https://plurality.net/read/"]);
    expect(previews["https://plurality.net/read/"]).toMatchObject({
      site: "Plurality",
      title: "Read — Plurality",
    });
    expect(fetched).not.toContain("https://theworldcafe.com/method/");
    expect(fetched).not.toContain("https://example.com/photo.png");
    expect(fetched).toContain("https://www.navalmanack.com/reading");
  });

  it("answers within its wait and lets a slow site finish later", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) =>
        url === "https://fast.example/"
          ? Promise.resolve(
              new Response("<head><title>Fast</title></head>", {
                headers: { "content-type": "text/html" },
              }),
            )
          : url.startsWith("https://fast.example/")
            ? Promise.resolve(new Response("", { status: 404 }))
            : new Promise<Response>((_, reject) =>
                init.signal?.addEventListener("abort", () =>
                  reject(new Error("aborted")),
                ),
              ),
      ),
    );
    const start = Date.now();
    const previews = await linkPreviewsFor(
      "[https://fast.example/](https://fast.example/) [https://slow.example/](https://slow.example/)",
      100,
    );
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(Object.keys(previews)).toEqual(["https://fast.example/"]);
  });
});

describe("previews for a site that turns the server away", () => {
  it("fall back to the site's icon from Google's favicon service", async () => {
    const icon = await png([30, 140, 230]);
    const fetched = serve({
      "https://blocked.example/post": () => new Response("", { status: 403 }),
      "https://www.google.com/s2/favicons?domain=blocked.example&sz=64": () =>
        new Response(new Uint8Array(icon)),
    });
    const previews = await linkPreviewsFor(
      '[Post — Blocked](https://blocked.example/post "@")',
    );
    expect(previews["https://blocked.example/post"]).toMatchObject({
      site: "",
      title: "blocked.example/post",
      description: null,
      image: null,
      github: null,
    });
    expect(previews["https://blocked.example/post"]?.icon).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(fetched).toEqual([
      "https://blocked.example/post",
      "https://www.google.com/s2/favicons?domain=blocked.example&sz=64",
    ]);
  });

  it("have nothing when Google has no icon either", async () => {
    serve({
      "https://unknown.example/post": () => new Response("", { status: 403 }),
      "https://www.google.com/s2/favicons?domain=unknown.example&sz=64": () =>
        new Response("", { status: 404 }),
    });
    expect(
      await linkPreviewsFor(
        "[https://unknown.example/post](https://unknown.example/post)",
      ),
    ).toEqual({});
  });
});

describe("noteLinks", () => {
  it("finds links the way the page renders them", () => {
    const links = noteLinks(
      [
        "See https://autolinked.example/page for more.",
        "- [Mercury](https://en.wikipedia.org/wiki/Mercury_(planet))",
        '- [Größe](https://de.wikipedia.org/wiki/Größe "@")',
        "",
        "```",
        "[not a link](https://code.example/)",
        "```",
        "",
        "And `https://inline-code.example/` too.",
      ].join("\n"),
    );
    expect(links).toEqual([
      {
        href: "https://autolinked.example/page",
        label: "https://autolinked.example/page",
        title: null,
      },
      {
        href: "https://en.wikipedia.org/wiki/Mercury_(planet)",
        label: "Mercury",
        title: null,
      },
      // The renderer receives the percent-encoded address, so that is the
      // preview's key.
      {
        href: "https://de.wikipedia.org/wiki/Gr%C3%B6%C3%9Fe",
        label: "Größe",
        title: "@",
      },
    ]);
  });

  it("skips the parse when nothing links outside Notion and the notes' images", () => {
    expect(
      noteLinks(
        "[Debt](https://app.notion.com/p/fdd190565ed148bf9f90b77bb7843efb) ![a](https://x.public.blob.vercel-storage.com/a.png)",
      ),
    ).toEqual([]);
  });
});

/** A solid square PNG, as a site would serve its icon or an avatar. */
function png(rgb: [number, number, number]): Promise<Buffer> {
  const [r, g, b] = rgb;
  return sharp({
    create: { width: 16, height: 16, channels: 4, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

/** Serve each address from `routes`, and record every address asked for. */
function serve(routes: Record<string, () => Response>): string[] {
  const fetched: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      fetched.push(url);
      const route = routes[url];
      return route
        ? Promise.resolve(route())
        : Promise.reject(new TypeError("fetch failed"));
    }),
  );
  return fetched;
}

const html = (body: string) =>
  new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

describe("unfurl", () => {
  it("gives up on a page that is missing, not HTML, untitled or unreachable", async () => {
    serve({
      "https://example.com/missing": () => new Response("", { status: 404 }),
      "https://example.com/paper.pdf": () =>
        new Response("%PDF-1.7", {
          headers: { "content-type": "application/pdf" },
        }),
      "https://example.com/untitled": () =>
        html(
          '<head><title>  </title><meta name="description" content="Words"></head>',
        ),
    });

    await expect(unfurl("https://example.com/missing")).resolves.toBeNull();
    await expect(unfurl("https://example.com/paper.pdf")).resolves.toBeNull();
    await expect(unfurl("https://example.com/untitled")).resolves.toBeNull();
    // A page that never answers costs its mention the preview, not the book.
    await expect(
      linkPreviewsFor("[https://example.com/down](https://example.com/down)"),
    ).resolves.toEqual({});
  });

  it("names the page by its host and draws the first icon that loads", async () => {
    const white = await png([255, 255, 255]);
    const fetched = serve({
      "https://www.example.org/essay": () =>
        html(
          `<head>
            <meta property="og:title" content="An essay">
            <link rel="apple-touch-icon" href="/touch.png">
            <link rel="icon" href="/broken.png" sizes="64x64">
          </head>`,
        ),
      "https://www.example.org/touch.png": () =>
        new Response("", { status: 404 }),
      "https://www.example.org/broken.png": () => new Response("not an image"),
      "https://www.example.org/favicon.ico": () =>
        new Response(new Uint8Array(white)),
    });

    const preview = await unfurl("https://www.example.org/essay");

    expect(preview).toMatchObject({
      site: "example.org",
      title: "An essay",
      description: null,
      iconTone: "light-tile",
      image: null,
      github: null,
    });
    expect(preview?.icon).toMatch(/^data:image\/png;base64,/);
    const icon = Buffer.from(preview!.icon!.split(",")[1]!, "base64");
    expect(await sharp(icon).metadata()).toMatchObject({
      width: 32,
      height: 32,
    });
    expect(fetched).toEqual([
      "https://www.example.org/essay",
      "https://www.example.org/touch.png",
      "https://www.example.org/broken.png",
      "https://www.example.org/favicon.ico",
    ]);
  });

  it("leaves a GitHub rate limit or outage to be tried again", async () => {
    serve({
      "https://api.github.com/repos/mgp/book-notes": () =>
        new Response("rate limited", { status: 403 }),
    });
    // A rejection is not cached; the next visit tries again.
    await expect(
      unfurl(
        "https://github.com/mgp/book-notes/blob/master/notes/talk%20like%20ted.markdown",
      ),
    ).rejects.toThrow("GitHub answered 403");
    await expect(
      unfurl("https://www.github.com/pluralitybook/plurality.git/"),
    ).rejects.toThrow("GitHub did not answer");
  });

  it("previews a GitHub page that is not a repository as a page", async () => {
    const fetched = serve({
      "https://api.github.com/repos/features/copilot": () =>
        new Response("", { status: 404 }),
      "https://github.com/features/copilot": () =>
        html(
          '<head><meta property="og:title" content="GitHub Copilot"></head>',
        ),
    });
    expect(await unfurl("https://github.com/features/copilot")).toMatchObject({
      site: "github.com",
      title: "GitHub Copilot",
      github: null,
    });
    expect(fetched).toContain("https://github.com/features/copilot");
  });

  it("takes a public repository's names, description and avatar from the API", async () => {
    const avatar = await png([30, 140, 230]);
    const fetched = serve({
      "https://api.github.com/repos/PluralityBook/Plurality": () =>
        Response.json({
          name: "plurality",
          private: false,
          description: "  Plurality: The Future of Collaborative Technology  ",
          owner: { login: "pluralitybook" },
        }),
      // GitHub sends the avatar on through a redirect, checked like any hop.
      "https://github.com/PluralityBook.png?size=128": () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://avatars.githubusercontent.com/u/1" },
        }),
      "https://avatars.githubusercontent.com/u/1": () =>
        new Response(new Uint8Array(avatar)),
    });

    const preview = await unfurl("https://github.com/PluralityBook/Plurality");

    expect(preview).toMatchObject({
      site: "GitHub",
      title: "pluralitybook/plurality",
      description: "Plurality: The Future of Collaborative Technology",
      github: { owner: "pluralitybook", repo: "plurality", file: null },
    });
    expect(preview?.github?.avatar).toMatch(/^data:image\/webp;base64,/);
    expect(fetched).toContain("https://avatars.githubusercontent.com/u/1");
  });

  it("keeps a private repository's description off the page", async () => {
    serve({
      "https://api.github.com/repos/chappyasel/secret": () =>
        Response.json({
          name: "Secret",
          private: true,
          description: "Plans nobody should read",
          owner: { login: "chappyasel" },
        }),
    });
    expect(
      await unfurl("https://github.com/chappyasel/secret/blob/main/a%20b.md"),
    ).toEqual({
      site: "GitHub",
      title: "a b.md",
      description: null,
      icon: null,
      iconTone: null,
      image: null,
      github: {
        owner: "chappyasel",
        repo: "secret",
        file: "a b.md",
        avatar: null,
      },
    });
  });

  it("never sends the server to a private address", async () => {
    const fetched = serve({
      "https://example.net/post": () =>
        html(`<head><title>Post</title>
          <link rel="apple-touch-icon" href="http://127.0.0.1:2375/x.png">
          <link rel="icon" sizes="64x64" href="https://router.internal/x.png">
          <link rel="icon" sizes="48x48" href="http://169.254.169.254/latest/meta-data/">
        </head>`),
      "https://example.net/moved": () =>
        new Response(null, {
          status: 301,
          headers: { location: "http://10.0.0.1/admin" },
        }),
    });
    expect(await unfurl("https://example.net/post")).toMatchObject({
      title: "Post",
      icon: null,
    });
    expect(await unfurl("https://example.net/moved")).toBeNull();
    expect(fetched).toEqual([
      "https://example.net/post",
      "https://example.net/moved",
    ]);
  });

  it("takes a deep link titled only with the site's name for no preview", async () => {
    serve({
      "https://www.reddit.com/r/books/comments/1": () =>
        html("<head><title>Reddit</title></head>"),
      "https://www.reddit.com/": () =>
        html("<head><title>Reddit</title></head>"),
    });
    // A bot check or login wall says nothing about the thread.
    expect(
      await unfurl("https://www.reddit.com/r/books/comments/1"),
    ).toBeNull();
    // The site's own front page may well be called just that.
    expect(await unfurl("https://www.reddit.com/")).toMatchObject({
      title: "Reddit",
    });
  });

  it("tries no more than three icons", async () => {
    const icons = Array.from(
      { length: 10 },
      (_, i) =>
        `<link rel="icon" sizes="${40 + i}x${40 + i}" href="/i${i}.png">`,
    ).join("");
    const fetched = serve({
      "https://example.com/many": () =>
        html(`<head><title>Many</title>${icons}</head>`),
    });
    await unfurl("https://example.com/many");
    expect(fetched.filter((url) => url.endsWith(".png"))).toHaveLength(3);
  });
});
