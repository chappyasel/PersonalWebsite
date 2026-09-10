import type { ResolvingMetadata } from "next";
import { describe, expect, it, vi } from "vitest";

import { sectionMetadata } from "./sectionMetadata";
import { getSectionPreview } from "./sectionPreviews.server";
import { sectionShareUrl } from "./sectionShare";

vi.mock("server-only", () => ({}));

function parent(origin: string, path: string): ResolvingMetadata {
  return Promise.resolve({
    metadataBase: new URL(origin),
    alternates: { canonical: { url: new URL(path, origin).href } },
    openGraph: {
      title: "Whole page",
      siteName: "Chappy Asel",
      locale: "en_US",
      type: "website",
    },
    twitter: { card: "summary_large_image", creator: "@chappyasel" },
  }) as unknown as ResolvingMetadata;
}

describe("section share previews", () => {
  it("gives the rapid recap its own share URL and preview image", async () => {
    const id = "dtw26-rapid-recap";
    const link = sectionShareUrl("https://www.chappyasel.com/systems", id);
    expect(link).toBe(
      "https://www.chappyasel.com/systems?section=dtw26-rapid-recap#dtw26-rapid-recap",
    );
    const metadata = await sectionMetadata(
      "systems",
      Promise.resolve({ section: new URL(link).searchParams.get("section")! }),
      parent("https://www.chappyasel.com", "/systems"),
    );
    expect(metadata.title).toEqual({ absolute: "DTW26 RAPID RECAP" });
    expect(metadata.openGraph).toMatchObject({
      url: "https://www.chappyasel.com/systems?section=dtw26-rapid-recap",
      images: [
        {
          url: "https://www.chappyasel.com/api/og/section?page=systems&section=dtw26-rapid-recap",
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      title: "DTW26 RAPID RECAP",
      card: "summary_large_image",
      images: metadata.openGraph?.images,
    });
  });

  it("resolves Deep Think Weeks from the nested synced toggle", async () => {
    const section = getSectionPreview("systems", "deep-think-weeks");
    expect(section).toEqual({
      id: "deep-think-weeks",
      title: "Deep Think Weeks",
      description: "annual foundations / direction / systems review + reset",
    });
    const metadata = await sectionMetadata(
      "systems",
      Promise.resolve({ section: "deep-think-weeks" }),
      parent("https://www.chappyasel.com", "/systems"),
    );
    expect(metadata.title).toEqual({ absolute: "Deep Think Weeks" });
    expect(metadata.openGraph).toMatchObject({
      title: "Deep Think Weeks",
      url: "https://www.chappyasel.com/systems?section=deep-think-weeks",
      images: [
        {
          url: "https://www.chappyasel.com/api/og/section?page=systems&section=deep-think-weeks",
          alt: "Deep Think Weeks",
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      title: "Deep Think Weeks",
      card: "summary_large_image",
      creator: "@chappyasel",
    });
    // Inherit /systems as the search canonical, not the social object's URL.
    expect(metadata.alternates).toBeUndefined();
  });

  it.each([
    undefined,
    "",
    "not-a-heading",
    ["foundations", "deep-think-weeks"],
    "__proto__",
  ])(
    "inherits normal metadata for an invalid selection: %s",
    async (section) => {
      expect(
        await sectionMetadata(
          "systems",
          Promise.resolve({ section }),
          parent("https://www.chappyasel.com", "/systems"),
        ),
      ).toEqual({});
    },
  );

  it("serves Routine's fixed sections under its canonical subdomain", async () => {
    const metadata = await sectionMetadata(
      "routine",
      Promise.resolve({ section: "morning" }),
      parent("https://routine.chappyasel.com", "/"),
    );
    expect(metadata.openGraph).toMatchObject({
      title: "Morning",
      url: "https://routine.chappyasel.com/?section=morning",
      images: [
        {
          url: "https://routine.chappyasel.com/api/og/section?page=routine&section=morning",
        },
      ],
    });
    expect(getSectionPreview("routine", "supp-stacks")?.title).toBe(
      "Supp Stacks",
    );
  });

  it("resolves Manual's opening panel and authored sections", () => {
    expect(getSectionPreview("manual", "tl-dr")?.title).toBe("TL;DR");
    expect(
      getSectionPreview("manual", "personality-strengths-blind-spots")?.title,
    ).toContain("Personality");
  });
});

describe("copied section URLs", () => {
  it.each([
    [
      "https://www.chappyasel.com/systems",
      "https://www.chappyasel.com/systems?section=deep-think-weeks#deep-think-weeks",
    ],
    [
      "https://manual.chappyasel.com/",
      "https://manual.chappyasel.com/?section=deep-think-weeks#deep-think-weeks",
    ],
    [
      "http://routine.localhost:3000/",
      "http://routine.localhost:3000/?section=deep-think-weeks#deep-think-weeks",
    ],
    [
      "http://localhost:3000/routine/",
      "http://localhost:3000/routine/?section=deep-think-weeks#deep-think-weeks",
    ],
    [
      "https://www.chappyasel.com/systems?section=foundations&utm_source=test#foundations",
      "https://www.chappyasel.com/systems?section=deep-think-weeks#deep-think-weeks",
    ],
  ])("adds the selection on %s", (base, expected) => {
    expect(sectionShareUrl(base, "deep-think-weeks")).toBe(expected);
  });

  it.each([
    "https://books.chappyasel.com/test-book",
    "https://www.chappyasel.com/books/test-book",
    "https://www.chappyasel.com/",
  ])("keeps ordinary anchors on %s", (base) => {
    expect(sectionShareUrl(base, "chapter-2")).toBe(`${base}#chapter-2`);
  });
});
