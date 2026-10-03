import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_DESCRIPTION,
  homepageMetadata,
  roomStopMetadata,
} from "./homeMetadata";

describe("homepage launch metadata", () => {
  it("identifies the canonical page and social account", () => {
    expect(homepageMetadata.description).toBe(HOMEPAGE_DESCRIPTION);
    expect(homepageMetadata.alternates?.canonical).toBe("/");
    expect(homepageMetadata.openGraph).toMatchObject({
      description: HOMEPAGE_DESCRIPTION,
      url: "/",
      siteName: "Chappy Asel",
      locale: "en_US",
      type: "website",
    });
    expect(homepageMetadata.twitter).toMatchObject({
      card: "summary_large_image",
      site: "@chappyasel",
      creator: "@chappyasel",
      description: HOMEPAGE_DESCRIPTION,
    });
  });
});

describe("room stop metadata", () => {
  const stop = {
    path: "/projects",
    title: "Chappy's Projects",
    description: "Apps and open source.",
  };

  it("names the homepage card for a stop without one of its own", () => {
    const metadata = roomStopMetadata(stop);
    const image = {
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "Chappy's Projects",
    };
    expect(metadata.openGraph?.images).toEqual([image]);
    expect(metadata.twitter?.images).toEqual([image]);
  });

  // File-based images do not cascade between sibling routes, but an image
  // named in the page's metadata replaces the route's own file. A stop with
  // its own opengraph-image.tsx leaves the slot empty for the file.
  it("leaves the image to the route's own card file", () => {
    const metadata = roomStopMetadata({ ...stop, ownCard: true });
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("uses the title as given, for the tab and the share", () => {
    const metadata = roomStopMetadata(stop);
    expect(metadata.title).toBe("Chappy's Projects");
    expect(metadata.openGraph?.title).toBe("Chappy's Projects");
    expect(metadata.twitter?.title).toBe("Chappy's Projects");
  });
});
