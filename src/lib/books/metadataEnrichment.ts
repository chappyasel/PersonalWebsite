import { isCoverImageUrl } from "./coverValidation";
import { minutesToHourDotMinutes } from "./lengthFetcher";
import { identifyMetadata, needsMetadata } from "./metadata";
import { fetchMetadataEvidence } from "./metadataProvider";
import { type NotionBook, fetchBookProperties } from "./notion";
import { createBookNotionClient } from "./notionClient";

/** Notion is the source of truth. Only acknowledged writes may reach the mirror. */
export async function enrichNotionBook(book: NotionBook): Promise<NotionBook> {
  if (!needsMetadata(book)) return book;
  let current = book;
  try {
    const evidence = await fetchMetadataEvidence(book);
    // Reread immediately before writing to preserve intervening manual edits.
    current = await fetchBookProperties(book.notionId);
    const decision = identifyMetadata(current, evidence);
    const { patch } = decision;
    if (patch.coverUrl && !(await isCoverImageUrl(patch.coverUrl))) {
      delete patch.coverUrl;
      decision.unresolved.push("coverUrl");
      decision.reason += " Cover did not respond as an image; verify its URL.";
    }
    const properties: Parameters<
      ReturnType<typeof createBookNotionClient>["pages"]["update"]
    >[0]["properties"] = {};
    if (patch.author !== undefined)
      properties.Author = {
        type: "rich_text",
        rich_text: [{ type: "text", text: { content: patch.author } }],
      };
    if (patch.coverUrl !== undefined)
      properties.Cover = { type: "url", url: patch.coverUrl };
    if (patch.publicationYear !== undefined)
      properties.Publication = {
        type: "number",
        number: patch.publicationYear,
      };
    if (patch.pageCount !== undefined)
      properties.Pages = { type: "number", number: patch.pageCount };
    if (patch.audioLengthMin != null)
      properties["Audio Length"] = {
        type: "number",
        number: minutesToHourDotMinutes(patch.audioLengthMin),
      };
    if (patch.audibleUrl !== undefined)
      properties.Audible = { type: "url", url: patch.audibleUrl };
    if (Object.keys(properties).length) {
      try {
        await createBookNotionClient().pages.update({
          page_id: book.notionId,
          properties,
        });
      } catch {
        console.warn("book_metadata", {
          notionId: book.notionId,
          ...decision,
          status: "write_failed",
          reason:
            "Notion update failed; mirror retains observed properties. Retry next sync.",
        });
        return current;
      }
    }
    console.info("book_metadata", { notionId: book.notionId, ...decision });
    return { ...current, ...patch };
  } catch {
    console.warn("book_metadata", {
      notionId: book.notionId,
      status: "upstream_error",
      reason: "Metadata lookup or Notion reread failed; retry next sync.",
    });
    return current;
  }
}
