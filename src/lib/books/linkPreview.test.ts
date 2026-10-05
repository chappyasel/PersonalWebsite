import { describe, expect, it } from "vitest";

import {
  type LinkPreview,
  isExternalLink,
  isMentionLink,
  isPastedAddress,
  mentionText,
  prettyUrl,
} from "./linkPreview";

function preview(overrides: Partial<LinkPreview> = {}): LinkPreview {
  return {
    site: "Plurality",
    title: "Read — Plurality",
    description: null,
    icon: null,
    iconTone: null,
    image: null,
    github: null,
    ...overrides,
  };
}

describe("isExternalLink", () => {
  it("takes web pages and leaves Notion, the site and note images alone", () => {
    expect(isExternalLink("https://plurality.net/read/")).toBe(true);
    expect(isExternalLink("http://handbook.gitlab.com")).toBe(true);
    expect(isExternalLink("https://app.notion.com/p/24ac5ab0d88d")).toBe(false);
    expect(isExternalLink("https://books.chappyasel.com/chatter")).toBe(false);
    expect(
      isExternalLink(
        "https://wpswkmg0yco7gjip.public.blob.vercel-storage.com/a.png",
      ),
    ).toBe(false);
    expect(isExternalLink("mailto:someone@example.com")).toBe(false);
    expect(isExternalLink("#chapter-2")).toBe(false);
  });
});

describe("isPastedAddress", () => {
  it("matches a link whose words are its own address", () => {
    const github = "https://github.com/pluralitybook/plurality";
    expect(isPastedAddress(github, github)).toBe(true);
    expect(
      isPastedAddress("handbook.gitlab.com", "http://handbook.gitlab.com"),
    ).toBe(true);
    expect(
      isPastedAddress(
        "navalmanack.com/navals-recommended-reading",
        "https://www.navalmanack.com/navals-recommended-reading",
      ),
    ).toBe(true);
  });

  it("leaves words the owner chose alone", () => {
    expect(
      isPastedAddress("World Cafe Method", "https://theworldcafe.com/method/"),
    ).toBe(false);
    expect(isPastedAddress("his site", "https://example.com")).toBe(false);
  });
});

describe("isMentionLink", () => {
  it("is one rule for the server and the renderer", () => {
    const naval = "https://www.navalmanack.com/reading/";
    expect(isMentionLink({ label: naval, href: naval })).toBe(true);
    expect(
      isMentionLink({
        label: "Read",
        href: "https://plurality.net/read/",
        title: "@",
      }),
    ).toBe(true);
    expect(
      isMentionLink({
        label: "World Cafe Method",
        href: "https://theworldcafe.com/method/",
      }),
    ).toBe(false);
    // A mention of a Notion page or the site itself is not a web mention.
    expect(
      isMentionLink({
        label: "Debt",
        href: "https://app.notion.com/p/fdd190565ed148bf9f90b77bb7843efb",
        title: "@",
      }),
    ).toBe(false);
  });

  it("knows a pasted address the renderer receives percent-encoded", () => {
    expect(
      isMentionLink({
        label: "https://de.wikipedia.org/wiki/Größe",
        href: "https://de.wikipedia.org/wiki/Gr%C3%B6%C3%9Fe",
      }),
    ).toBe(true);
  });
});

describe("prettyUrl", () => {
  it("drops the scheme, www and a closing slash", () => {
    expect(prettyUrl("https://www.navalmanack.com/reading/")).toBe(
      "navalmanack.com/reading",
    );
    expect(prettyUrl("https://en.wikipedia.org/wiki/Gresham%27s_law")).toBe(
      "en.wikipedia.org/wiki/Gresham's_law",
    );
  });
});

describe("mentionText", () => {
  it("names the site once when the title already ends with it", () => {
    expect(mentionText("https://plurality.net/read/", preview())).toEqual({
      context: "Plurality",
      title: "Read",
      joined: false,
    });
    expect(
      mentionText(
        "https://southasia.ucla.edu/alexander/",
        preview({
          site: "MANAS",
          title: "Alexander and the Gymnosophists | MANAS",
        }),
      ),
    ).toEqual({
      context: "MANAS",
      title: "Alexander and the Gymnosophists",
      joined: false,
    });
  });

  it("keeps a title that only contains the site's name inside a word", () => {
    expect(
      mentionText(
        "https://example.com",
        preview({ site: "Plurality", title: "Pluralityism explained" }),
      ),
    ).toEqual({
      context: "Plurality",
      title: "Pluralityism explained",
      joined: false,
    });
  });

  it("drops the context when the site's name is the whole title", () => {
    expect(
      mentionText(
        "http://handbook.gitlab.com",
        preview({ site: "The GitLab Handbook", title: "The GitLab Handbook" }),
      ),
    ).toEqual({ context: null, title: "The GitLab Handbook", joined: false });
  });

  it("reads GitHub as its own path", () => {
    const github = { owner: "pluralitybook", repo: "plurality", avatar: null };
    expect(
      mentionText(
        "https://github.com/pluralitybook/plurality",
        preview({ github: { ...github, file: null } }),
      ),
    ).toEqual({ context: "pluralitybook/", title: "plurality", joined: true });
    expect(
      mentionText(
        "https://github.com/mgp/book-notes/blob/master/talk-like-ted.markdown",
        preview({
          github: {
            owner: "mgp",
            repo: "book-notes",
            file: "talk-like-ted.markdown",
            avatar: null,
          },
        }),
      ),
    ).toEqual({
      context: "mgp/book-notes/",
      title: "talk-like-ted.markdown",
      joined: true,
    });
  });

  it("titles a link mention with the words Notion stored", () => {
    // A site that answers bots with a challenge page still shows the title
    // Notion captured; the preview only lends its icon and name.
    expect(
      mentionText(
        "https://www.reddit.com/r/books/comments/1",
        preview({ site: "Reddit", title: "Reddit" }),
        "What are you reading? — Reddit",
      ),
    ).toEqual({
      context: "Reddit",
      title: "What are you reading?",
      joined: false,
    });
    expect(
      mentionText("https://plurality.net/read/", undefined, "Read — Plurality"),
    ).toEqual({ context: null, title: "Read — Plurality", joined: false });
  });

  it("shows the tidied address without a preview", () => {
    expect(
      mentionText("https://www.navalmanack.com/navals-recommended-reading"),
    ).toEqual({
      context: null,
      title: "navalmanack.com/navals-recommended-reading",
      joined: false,
    });
  });
});
