import { fetchBookCover } from "./coverFetcher";
import { isCoverImageUrl } from "./coverValidation";
import { minutesToHourDotMinutes } from "./lengthFetcher";
import {
  type MetadataFailure,
  identifyMetadata,
  needsMetadata,
} from "./metadata";
import { fetchMetadataEvidence } from "./metadataProvider";
import { type NotionBook, fetchBookProperties } from "./notion";
import { createBookNotionClient } from "./notionClient";

/**
 * Notion is the source of truth. Only acknowledged writes may reach the mirror.
 * `reportFailure` hears catalog outages and failed reads or writes, so the
 * sync record shows them; a truncated result set is an answer, not an outage.
 */
export async function enrichNotionBook(
  book: NotionBook,
  reportFailure: (reason: string) => void = () => undefined,
): Promise<NotionBook> {
  if (!needsMetadata(book)) return book;
  let current = book;
  try {
    // Catalog evidence rarely pins a cover: Google lists one edition under
    // several volumes, each with its own image. Before the evidence rewrite
    // the sync filled nearly every cover from Amazon's print edition, then
    // Google, then Open Library, so a blank cover still falls back to that.
    const [evidence, fallbackCover] = await Promise.all([
      fetchMetadataEvidence(book),
      blankCover(book.coverUrl)
        ? fetchBookCover(book.title, book.author).catch(() => null)
        : null,
    ]);
    const outages = evidence.failures.filter(
      (failure) => failure.code !== "truncated",
    );
    if (outages.length) reportFailure(outages.map(describeFailure).join(", "));
    // Reread immediately before writing to preserve intervening manual edits.
    current = await fetchBookProperties(book.notionId);
    const decision = identifyMetadata(current, evidence);
    const { patch } = decision;
    if (patch.coverUrl && !(await isCoverImageUrl(patch.coverUrl))) {
      delete patch.coverUrl;
      decision.unresolved.push("coverUrl");
      decision.reason += " Cover did not respond as an image; verify its URL.";
    }
    if (
      blankCover(current.coverUrl) &&
      !patch.coverUrl &&
      fallbackCover &&
      (await isCoverImageUrl(fallbackCover))
    ) {
      patch.coverUrl = fallbackCover;
      decision.unresolved = decision.unresolved.filter(
        (field) => field !== "coverUrl",
      );
      decision.reason += " Cover from the Amazon, Google, Open Library chain.";
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
        reportFailure("Notion write failed");
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
    reportFailure("lookup or Notion reread failed");
    console.warn("book_metadata", {
      notionId: book.notionId,
      status: "upstream_error",
      reason: "Metadata lookup or Notion reread failed; retry next sync.",
    });
    return current;
  }
}

function blankCover(url: string | null): boolean {
  return !url?.trim();
}

function describeFailure(failure: MetadataFailure): string {
  const what =
    failure.code === "http"
      ? `HTTP ${failure.httpStatus ?? "error"}`
      : failure.code.replace("_", " ");
  return `${failure.source} ${what}`;
}
