/**
 * The site's own pages as running text refers to them.
 *
 * `label` is the short name used inline when Notion stored a bare URL as the
 * link text. `title` is the owner's title, the way each page names itself in
 * its hero. `description` is the one line the page publishes in its
 * metadata; the layouts read it from here so a hover card and the page's
 * own <meta> cannot disagree. `host` and `path` are how a link to the page
 * is recognised after the Notion export's URL rewriting.
 */
export type SitePageKey = "manual" | "routine" | "weightlifting" | "books";

export type SitePage = {
  label: string;
  title: string;
  description: string;
  host: string;
  path: string;
};

export const SITE_PAGES: Record<SitePageKey, SitePage> = {
  manual: {
    label: "Personal Operating Manual",
    title: "Chappy's Personal Operating Manual",
    description:
      "How I work, communicate, and collaborate. A guide to working with Chappy Asel.",
    host: "manual.chappyasel.com",
    path: "/manual",
  },
  routine: {
    label: "Core Daily Routine",
    title: "Chappy's Core Daily Routine",
    description:
      "My infamously early morning routine, workout schedule, supplement stacks, and sleep optimization.",
    host: "routine.chappyasel.com",
    path: "/routine",
  },
  weightlifting: {
    label: "Weightlifting",
    title: "Chappy's Weightlifting",
    description: "Workout stats, personal records, and training log",
    host: "weightlifting.chappyasel.com",
    path: "/weightlifting",
  },
  books: {
    label: "Book Notes",
    title: "Chappy's Book Notes",
    description: "My reading collection with notes and reviews",
    host: "books.chappyasel.com",
    path: "/books",
  },
};

const SITE_PAGE_KEYS = Object.keys(SITE_PAGES) as SitePageKey[];

/**
 * Which of the site's pages a link points at, or null. A page is matched by
 * its production host or by chappyasel.com plus its path. The library's
 * root is the Book Notes page; a book's own URL is not a site page, because
 * BookLink owns those.
 */
export function sitePageForHref(href: string): SitePageKey | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");

  for (const key of SITE_PAGE_KEYS) {
    const page = SITE_PAGES[key];
    if (host === page.host) {
      if (key === "books" && path !== "") return null;
      return key;
    }
    if (host === "chappyasel.com" && path === page.path) return key;
  }
  return null;
}

/** True for text that is nothing but a URL, the way Notion stores a pasted
 * link with no display text. */
export function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}
