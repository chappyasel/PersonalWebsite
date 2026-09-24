import { beforeEach, expect, it, vi } from "vitest";

import { enrichNotionBook } from "./metadataEnrichment";
import type { NotionBook } from "./notion";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  evidence: vi.fn(),
  image: vi.fn(),
}));
vi.mock("./notion", () => ({ fetchBookProperties: mocks.read }));
vi.mock("./notionClient", () => ({
  createBookNotionClient: () => ({ pages: { update: mocks.write } }),
}));
vi.mock("./metadataProvider", () => ({
  fetchMetadataEvidence: mocks.evidence,
}));
vi.mock("./coverValidation", () => ({ isCoverImageUrl: mocks.image }));
const book = {
  notionId: "page",
  title: "Superintelligence",
  author: "",
  publicationYear: null,
  pageCount: 352,
  coverUrl: null,
  audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
  audioLengthMin: null,
  lastEditedTime: "2026-01-01T00:00:00Z",
  tags: ["AI"],
} as NotionBook;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ ...book });
  mocks.write.mockResolvedValue({});
  mocks.image.mockResolvedValue(true);
  mocks.evidence.mockResolvedValue({
    failures: [],
    candidates: [
      {
        source: "google",
        id: "oup",
        title: book.title,
        authors: ["Nick Bostrom"],
        coverUrl: "https://example.com/oup.jpg",
        publicationYear: 2014,
        pageCount: 352,
      },
      {
        source: "audible",
        id: "B00LPMD72K",
        title: book.title,
        authors: ["Nick Bostrom"],
        audioLengthMin: 781,
      },
    ],
  });
});
it("writes recovered author and evidence-backed fields to Notion before returning them", async () => {
  const result = await enrichNotionBook(book);
  expect(mocks.write).toHaveBeenCalledWith({
    page_id: "page",
    properties: {
      Author: {
        type: "rich_text",
        rich_text: [{ type: "text", text: { content: "Nick Bostrom" } }],
      },
      Cover: { type: "url", url: "https://example.com/oup.jpg" },
      Publication: { type: "number", number: 2014 },
      "Audio Length": { type: "number", number: 13.01 },
    },
  });
  expect(result.author).toBe("Nick Bostrom");
  expect(result.tags).toEqual(["AI"]);
});
it("rechecks Notion and preserves a manual edit made during the lookup", async () => {
  const manual = {
    ...book,
    author: "Nick Bostrom",
    coverUrl: "https://example.com/manual",
    publicationYear: 2014,
    audioLengthMin: 900,
  };
  mocks.read.mockResolvedValue(manual);
  expect(await enrichNotionBook(book)).toEqual(manual);
  expect(mocks.write).not.toHaveBeenCalled();
});
it("does not return unsaved guesses after a Notion write failure", async () => {
  mocks.write.mockRejectedValue(new Error("Notion unavailable"));
  expect(await enrichNotionBook(book)).toEqual(book);
});
it("leaves an unverified image blank while retaining proven author metadata", async () => {
  mocks.image.mockResolvedValue(false);
  const result = await enrichNotionBook(book);
  expect(result.coverUrl).toBeNull();
  expect(result.author).toBe("Nick Bostrom");
});
it("does not write on upstream failure and retries on the next invocation", async () => {
  mocks.evidence.mockResolvedValueOnce({
    candidates: [],
    failures: [{ source: "google", code: "http", httpStatus: 503 }],
  });
  expect(await enrichNotionBook(book)).toEqual(book);
  expect(mocks.write).not.toHaveBeenCalled();
  expect((await enrichNotionBook(book)).author).toBe("Nick Bostrom");
});
it("repeated complete runs make no catalog or Notion writes", async () => {
  const complete = await enrichNotionBook(book);
  vi.clearAllMocks();
  expect(await enrichNotionBook(complete)).toEqual(complete);
  expect(mocks.evidence).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
