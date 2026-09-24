import type { PageObjectResponse } from "@notionhq/client";
import { expect, it, vi } from "vitest";

import { transformNotionPageToBook } from "./notion";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("./notionClient", () => ({ createBookNotionClient: () => ({}) }));
vi.mock("notion-to-md", () => ({ NotionToMarkdown: class {} }));
it("joins all title/author text spans and preserves nonempty manual page counts", () => {
  const page = {
    id: "test",
    properties: {
      Title: {
        title: [{ plain_text: "Super" }, { plain_text: "intelligence" }],
      },
      Author: {
        rich_text: [{ plain_text: "Nick " }, { plain_text: "Bostrom" }],
      },
      Pages: { number: 12 },
      Publication: { number: 2014 },
      "Audio Length": { number: 14.17 },
    },
  } as unknown as PageObjectResponse;
  expect(transformNotionPageToBook(page)).toMatchObject({
    title: "Superintelligence",
    author: "Nick Bostrom",
    pageCount: 12,
    publicationYear: 2014,
    audioLengthMin: 857,
  });
  page.properties.Pages = { type: "number", id: "pages", number: 0 };
  expect(transformNotionPageToBook(page).pageCount).toBe(0);
});
