import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { serializeRoomBooksArtworkIdentity } from "./booksIdentity";

type IdentityInput = Parameters<typeof serializeRoomBooksArtworkIdentity>[0] & {
  featuredBookColors: Record<string, { edge: string; source: string }>;
};

const originalHash =
  "56d8b48a2065491894ec97743dfa0805ea05d150e25f8aa01f03fd67b39155b3";
const currentHash =
  "c807357cd5747214133e272183e6a81be6e441d52ceb0b4a572938eaca68594f";
const bytes = readFileSync(
  "scripts/generate/room-artwork-inputs/captured-source/books-identity-v1.json",
);
const original = JSON.parse(bytes.toString()) as IdentityInput;
const expected = serializeRoomBooksArtworkIdentity(original);

describe("Books artwork identity version 2", () => {
  it("derives the content digest from the exact approved version 1 preimage", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(originalHash);
    expect(createHash("sha256").update(expected).digest("hex")).toBe(
      currentHash,
    );
    expect(JSON.parse(expected)).toMatchObject({ version: 2 });
    expect(expected).not.toContain('"featuredBookColors"');
    expect(expected).not.toContain('"edgeColor"');
  });

  it("tolerates the production sampling differences and featured palette changes", () => {
    const data = structuredClone(original);
    data.spineBooks[4]!.edgeColor = "#9a7136";
    data.spineBooks[9]!.edgeColor = "#3f797a";
    data.spineBooks[16]!.edgeColor = "#3f797a";
    data.featuredBookColors = {};
    expect(serializeRoomBooksArtworkIdentity(data)).toBe(expected);
  });

  it.each(["id", "title", "author", "coverUrl"] as const)(
    "detects a changed featured %s",
    (field) => {
      const data = structuredClone(original);
      data.featuredBooks[0]![field] =
        `${data.featuredBooks[0]![field]} changed`;
      expect(serializeRoomBooksArtworkIdentity(data)).not.toBe(expected);
    },
  );

  it.each(["pageCount", "audioLengthMin"] as const)(
    "detects changed featured %s dimensions",
    (field) => {
      const data = structuredClone(original);
      data.featuredBooks[0]![field] = (data.featuredBooks[0]![field] ?? 0) + 1;
      expect(serializeRoomBooksArtworkIdentity(data)).not.toBe(expected);
    },
  );

  it.each(["id", "title", "author"] as const)(
    "detects a changed spine %s",
    (field) => {
      const data = structuredClone(original);
      data.spineBooks[0]![field] = `${data.spineBooks[0]![field]} changed`;
      expect(serializeRoomBooksArtworkIdentity(data)).not.toBe(expected);
    },
  );

  it.each(["pageCount", "audioLengthMin"] as const)(
    "detects changed spine %s dimensions",
    (field) => {
      const data = structuredClone(original);
      data.spineBooks[0]![field] = (data.spineBooks[0]![field] ?? 0) + 1;
      expect(serializeRoomBooksArtworkIdentity(data)).not.toBe(expected);
    },
  );

  it.each(["featuredBooks", "spineBooks"] as const)(
    "detects reordered %s",
    (collection) => {
      const data = structuredClone(original);
      data[collection].reverse();
      expect(serializeRoomBooksArtworkIdentity(data)).not.toBe(expected);
    },
  );

  it.each(["featuredBooks", "spineBooks"] as const)(
    "detects a removed selection in %s",
    (collection) => {
      const data = structuredClone(original);
      data[collection].pop();
      expect(serializeRoomBooksArtworkIdentity(data)).not.toBe(expected);
    },
  );
});
