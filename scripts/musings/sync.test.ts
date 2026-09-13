import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { describe, expect, it } from "vitest";

import type { BlockTree } from "./notion";
import { convertBlocks, editorialUpdatedAt, isPublishedMusing } from "./sync";

function page(
  musing: boolean,
  status: string,
  date: string | null,
): PageObjectResponse {
  return {
    archived: false,
    in_trash: false,
    properties: {
      Musing: { type: "checkbox", checkbox: musing },
      Status: { type: "status", status: { name: status } },
      Date: { type: "date", date: date ? { start: date } : null },
    },
  } as unknown as PageObjectResponse;
}
const rt = (text: string) => [
  {
    type: "text",
    text: { content: text },
    plain_text: text,
    href: null,
    annotations: {},
  },
];
describe("Notion publication boundary", () => {
  it("ignores Notion maintenance timestamps and uses only an authored revision date", () => {
    const post = {
      ...page(true, "Posted", "2023-01-01"),
      last_edited_time: "2026-09-13T00:00:00Z",
    };
    const now = new Date("2026-09-12T12:00:00Z");
    expect(editorialUpdatedAt(post, "2023-01-01", now)).toBe("2023-01-01");
    const updated = (value: string) =>
      ({
        ...post,
        properties: {
          ...post.properties,
          Updated: {
            id: "updated",
            type: "date",
            date: { start: value, end: null, time_zone: null },
          },
        },
      }) as PageObjectResponse;
    expect(editorialUpdatedAt(updated("2024-02-01"), "2023-01-01", now)).toBe(
      "2024-02-01",
    );
    for (const value of ["2022-01-01", "2027-01-01", "invalid"]) {
      expect(() =>
        editorialUpdatedAt(updated(value), "2023-01-01", now),
      ).toThrow(/Updated/);
    }
  });
  it("requires both the checkbox and Posted, and excludes future and archived pages", () => {
    const now = new Date("2026-09-12T12:00:00Z");
    expect(isPublishedMusing(page(true, "Posted", "2023-01-01"), now)).toBe(
      true,
    );
    for (const p of [
      page(false, "Posted", "2023-01-01"),
      page(true, "Drafted", "2023-01-01"),
      page(true, "Posted", "2027-01-01"),
      { ...page(true, "Posted", "2023-01-01"), archived: true },
    ])
      expect(isPublishedMusing(p, now)).toBe(false);
    expect(() => isPublishedMusing(page(true, "Posted", null), now)).toThrow(
      /Date/,
    );
  });
  it("keeps image captions and replaces expiring URLs with local image paths", async () => {
    const blocks = [
      {
        type: "image",
        image: {
          type: "file",
          file: { url: "https://notion.example/signed?token=temporary" },
          caption: rt("Original caption"),
        },
      },
    ] as BlockTree[];
    const result = await convertBlocks(blocks, async (_url, alt) => ({
      src: "/images/musings/photo.webp",
      width: 800,
      height: 400,
      alt,
    }));
    expect(JSON.stringify(result)).not.toContain("temporary");
    expect(result[0]).toMatchObject({
      type: "image",
      caption: [{ text: "Original caption" }],
      image: { alt: "Original caption" },
    });
  });
  it("keeps duplicate headings addressable and rejects unsupported blocks", async () => {
    const blocks = [1, 2].map(() => ({
      type: "heading_2",
      heading_2: { rich_text: rt("A thought") },
    })) as BlockTree[];
    expect(
      await convertBlocks(blocks, async () => {
        throw new Error("unexpected image");
      }),
    ).toMatchObject([{ id: "a-thought" }, { id: "a-thought-2" }]);
    await expect(
      convertBlocks([{ type: "child_page" }] as BlockTree[], async () => {
        throw new Error("unexpected");
      }),
    ).rejects.toThrow(/Unsupported/);
  });
});
