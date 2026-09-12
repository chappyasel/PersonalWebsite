import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RoomArtworkImage } from "./RoomArtworkImage";
import { serializeRoomBooksArtworkIdentity } from "./booksIdentity";
import { getRoomArtwork } from "./getRoomArtwork";

describe("room artwork SSR contract", () => {
  it("offers only the selected shelf and uses media selection without client state", () => {
    const html = renderToStaticMarkup(
      <RoomArtworkImage unitIndex={6} alt="Talks" />,
    );
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("max-width: 599px");
    expect(html).toContain("/talks/light-desktop.svg");
    expect(html).not.toMatch(
      /\/(books|projects|weightlifting|systems|musings)\//,
    );
    expect(html).not.toContain("<script");
  });
  it("honors explicit theme/size and leaves About and fractional destinations to their owners", () => {
    const html = renderToStaticMarkup(
      <RoomArtworkImage
        unitIndex={2}
        theme="dark"
        viewport="phone"
        alt="Weightlifting"
      />,
    );
    expect(html).toContain("/weightlifting/dark-phone.svg");
    expect(html).not.toContain("light-");
    expect(getRoomArtwork(0, "light", "desktop")).toBeNull();
    expect(getRoomArtwork(1.5, "light", "desktop")).toBeNull();
    expect(getRoomArtwork(4, "dark", "phone")?.camera.projection).toHaveLength(
      16,
    );
  });
});

describe("Books approved data identity", () => {
  it("reproduces the recovered digest from only layout and material inputs", () => {
    const captured = JSON.parse(
      readFileSync(
        "docs/reviews/production-artwork-metadata-recovery/books-data-identity.json",
        "utf8",
      ),
    ) as Parameters<typeof serializeRoomBooksArtworkIdentity>[0];
    const hash = createHash("sha256")
      .update(serializeRoomBooksArtworkIdentity(captured))
      .digest("hex");
    expect(hash).toBe(
      "56d8b48a2065491894ec97743dfa0805ea05d150e25f8aa01f03fd67b39155b3",
    );
    expect(
      serializeRoomBooksArtworkIdentity({
        ...captured,
        featuredBooks: captured.featuredBooks.slice(1),
      }),
    ).not.toBe(serializeRoomBooksArtworkIdentity(captured));
  });
});
