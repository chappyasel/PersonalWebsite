import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingPage } from "~/lib/booking/page";

import MeetLinkPage, { generateMetadata as linkMetadata } from "./[slug]/page";
import { MeetOgCard, ogFacts } from "./ogCard";
import MeetPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({ env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site" } }));
vi.mock("./read", () => ({ readMeet: mocks.read }));
// A plain visit: no force reload, so the short entrance (intro.ts).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./MeetThemeColor", () => ({ MeetThemeColor: () => null }));
vi.mock("./MeetBooking", () => ({
  MeetBooking: ({
    slug,
    turnstileSiteKey,
  }: {
    slug: string;
    turnstileSiteKey?: string;
  }) => (
    <p>
      Picker for {slug} with {turnstileSiteKey}
    </p>
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const link = (
  lengths: number[],
  call: BookingPage["link"]["call"] = { kind: "meet" },
): BookingPage["link"] => ({
  slug: "meet",
  title: "Meet with Chappy",
  host: "Chappy",
  lengths,
  defaultLength: lengths[0]!,
  call,
});
const open = (lengths: number[], call?: BookingPage["link"]["call"]) => ({
  status: "open" as const,
  page: { link: link(lengths, call) } as BookingPage,
});
/** Renders a page whose element is the async MeetScreen. */
async function draw(page: ReactElement | Promise<ReactElement>) {
  const element = (await page) as ReactElement<{ slug: string }>;
  const screen = element.type as (props: {
    slug: string;
  }) => Promise<ReactElement>;
  return renderToStaticMarkup(await screen(element.props));
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const SECRET = ["k3", "private", "link", "slug"].join("-");

describe("/meet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says booking isn't open without a deployment", async () => {
    mocks.read.mockResolvedValue({ status: "closed" });
    const html = await draw(MeetPage());
    expect(html).toContain("Booking isn&#x27;t open right now.");
    expect(html).toContain('href="mailto:chappyasel@gmail.com"');
    expect(html).not.toContain("Picker");
  });

  it("says the calendar didn't answer when the deployment is down", async () => {
    mocks.read.mockResolvedValue({ status: "unavailable" });
    const html = await draw(MeetPage());
    expect(html).toContain("didn&#x27;t answer");
    expect(html).toMatch(/<a[^>]*href="\/meet"[^>]*>Try again<\/a>/);
  });

  it("reads the `meet` link and puts its one length in the header", async () => {
    mocks.read.mockResolvedValue(open([30]));
    const html = await draw(MeetPage());
    expect(mocks.read).toHaveBeenCalledWith("meet");
    expect(html).toContain("<h1");
    expect(html).toContain("Meet with Chappy");
    expect(html).toContain("30 minutes");
    expect(html).toContain("Google Meet");
    expect(html).not.toContain("Pick a time.");
    expect(html).toContain("Picker for meet with site");
  });

  it("names no length in the header when the link offers several", async () => {
    mocks.read.mockResolvedValue(open([15, 30]));
    const html = await draw(MeetPage());
    expect(html).not.toContain("minutes");
  });

  it("draws in Daybreak's look, not the site's", async () => {
    mocks.read.mockResolvedValue(open([30]));
    const html = await draw(MeetPage());
    expect(html).toContain('class="meet-root"');
    expect(html).not.toMatch(/dl-|daylight/);
  });
});

describe("/meet/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the link the slug names", async () => {
    mocks.read.mockResolvedValue(open([15]));
    const html = await draw(MeetLinkPage(params("15")));
    expect(mocks.read).toHaveBeenCalledWith("15");
    expect(html).toContain("15 minutes");
    expect(html).toContain("Picker for 15 with site");
  });

  it("is a 404 for a link Daybreak doesn't have or a malformed slug", async () => {
    mocks.read.mockResolvedValue({ status: "closed" });
    await expect(draw(MeetLinkPage(params("45")))).rejects.toThrow("404");
    await expect(MeetLinkPage(params("Not_A_Slug"))).rejects.toThrow("404");
    await expect(MeetLinkPage(params("a".repeat(65)))).rejects.toThrow("404");
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it("sends /meet/meet to /meet", async () => {
    await expect(MeetLinkPage(params("meet"))).rejects.toThrow(
      "redirect /meet",
    );
  });
});

describe("metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("indexes /meet with its length, call, canonical URL, and card", async () => {
    mocks.read.mockResolvedValue(open([30]));
    const metadata = await generateMetadata();
    expect(metadata.title).toEqual({ absolute: "Meet with Chappy · 30m" });
    expect(metadata.description).toBe(
      "Book 30 minutes with Chappy on Google Meet. Times show in your zone.",
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://www.chappyasel.com/meet",
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "https://www.chappyasel.com/meet",
      siteName: "Chappy Asel",
      title: "Meet with Chappy · 30m",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("keeps the other links out of search", async () => {
    mocks.read.mockResolvedValue(open([60]));
    const metadata = await linkMetadata(params("60"));
    expect(metadata.title).toEqual({ absolute: "Meet with Chappy · 60m" });
    expect(metadata.description).toBe(
      "Book 60 minutes with Chappy on Google Meet. Times show in your zone.",
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://www.chappyasel.com/meet/60",
    );
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("never repeats a private link's slug", async () => {
    mocks.read.mockResolvedValue(open([45]));
    const metadata = await linkMetadata(params(SECRET));
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain(SECRET);
  });

  it("stays generic when the link is closed", async () => {
    mocks.read.mockResolvedValue({ status: "closed" });
    const metadata = await linkMetadata(params("15"));
    expect(metadata.title).toEqual({ absolute: "Meet with Chappy" });
    expect(metadata.description).toBe(
      "Book a time with Chappy. Times show in your zone.",
    );
  });
});

describe("the share card", () => {
  it("names the link's length and call", () => {
    const html = renderToStaticMarkup(
      <MeetOgCard
        {...ogFacts(open([15]))}
        portrait="data:image/jpeg;base64,"
      />,
    );
    expect(html).toContain("Meet with Chappy");
    expect(html).toMatch(/15<span[^>]*>m<\/span>/);
    expect(html).toContain("Google Meet");
  });

  it("never shows a place's address or a closed link's length", () => {
    expect(
      ogFacts(open([30], { kind: "place", location: "1 Main St" })).call,
    ).toBe("In person");
    expect(ogFacts({ status: "closed" }, Date.UTC(2026, 10, 4, 20))).toEqual({
      title: "Meet with Chappy",
      length: null,
      call: null,
      today: "2026-11-04",
    });
  });
});
