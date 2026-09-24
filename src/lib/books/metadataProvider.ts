import { z } from "zod";

import { stripCoverCurl } from "./coverUtils";
import {
  type MetadataEvidence,
  type MetadataFailure,
  type MetadataInput,
  audibleAsin,
} from "./metadata";

const positiveInteger = z.number().int().positive().optional();
const googleVolume = z.object({
  id: z.string(),
  volumeInfo: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    authors: z.array(z.string()).optional(),
    publishedDate: z.string().optional(),
    pageCount: z.number().optional(),
    imageLinks: z
      .object({
        thumbnail: z.string().optional(),
        small: z.string().optional(),
        medium: z.string().optional(),
        large: z.string().optional(),
        extraLarge: z.string().optional(),
      })
      .optional(),
  }),
});
const googleResponse = z.object({
  totalItems: z.number(),
  items: z.array(googleVolume).optional(),
});
const audibleProduct = z.object({
  asin: z.string().regex(/^[A-Z0-9]{10}$/),
  title: z.string(),
  authors: z.array(z.object({ name: z.string() })).optional(),
  runtime_length_min: positiveInteger,
});
const audibleResponse = z.object({
  products: z.array(audibleProduct),
  total_results: z.number().optional(),
});

class CatalogHttpError extends Error {
  constructor(readonly status: number) {
    super("Catalog HTTP error");
  }
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new CatalogHttpError(response.status);
  return response.json();
}

/** Bounded catalog reads. Keep all candidates; the resolver decides identity. */
export async function fetchMetadataEvidence(
  book: Pick<MetadataInput, "title" | "author"> &
    Partial<Pick<MetadataInput, "audibleUrl">>,
): Promise<MetadataEvidence> {
  const result: MetadataEvidence = { candidates: [], failures: [] };
  const query = [
    `intitle:${JSON.stringify(book.title)}`,
    ...(book.author.trim() ? [`inauthor:${JSON.stringify(book.author)}`] : []),
  ].join(" ");
  const googleUrl = `https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q: query, maxResults: "40" })}`;
  const asin = audibleAsin(book.audibleUrl ?? null);
  const audibleParams = new URLSearchParams({
    title: book.title,
    num_results: "50",
    response_groups: "product_attrs,contributors,product_desc",
  });
  if (book.author.trim()) audibleParams.set("author", book.author);
  const audibleUrl = asin
    ? `https://api.audible.com/1.0/catalog/products/${asin}?response_groups=product_attrs,contributors,product_desc`
    : `https://api.audible.com/1.0/catalog/products?${audibleParams}`;
  const responses = await Promise.allSettled([
    json(googleUrl),
    json(audibleUrl),
  ]);
  const google = responses[0];
  if (google.status === "fulfilled") {
    const parsed = googleResponse.safeParse(google.value);
    if (!parsed.success)
      result.failures.push({ source: "google", code: "invalid_response" });
    else {
      const { items = [], totalItems } = parsed.data;
      if (totalItems > items.length)
        result.failures.push({ source: "google", code: "truncated" });
      for (const { id, volumeInfo: info } of items) {
        const links = info.imageLinks;
        const rawCover =
          links?.extraLarge ??
          links?.large ??
          links?.medium ??
          links?.small ??
          links?.thumbnail;
        const coverUrl =
          rawCover && /^https?:\/\//.test(rawCover)
            ? (stripCoverCurl(rawCover.replace(/^http:/, "https:")) ??
              undefined)
            : undefined;
        const year = /^\d{4}(?:-|$)/.test(info.publishedDate ?? "")
          ? Number(info.publishedDate!.slice(0, 4))
          : undefined;
        result.candidates.push({
          source: "google",
          id,
          title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
          authors: info.authors ?? [],
          publicationYear:
            year && year >= 1000 && year <= new Date().getUTCFullYear() + 1
              ? year
              : undefined,
          pageCount:
            info.pageCount &&
            Number.isInteger(info.pageCount) &&
            info.pageCount >= 20
              ? info.pageCount
              : undefined,
          coverUrl,
        });
      }
    }
  } else result.failures.push(requestFailure("google", google.reason));
  const audible = responses[1];
  if (audible.status === "fulfilled") {
    const parsed = asin
      ? z
          .object({ product: audibleProduct })
          .transform((data) => ({ products: [data.product], total_results: 1 }))
          .safeParse(audible.value)
      : audibleResponse.safeParse(audible.value);
    if (!parsed.success)
      result.failures.push({ source: "audible", code: "invalid_response" });
    else {
      if (
        (parsed.data.total_results ?? parsed.data.products.length) >
          parsed.data.products.length ||
        (!asin && parsed.data.products.length >= 50)
      )
        result.failures.push({ source: "audible", code: "truncated" });
      for (const product of parsed.data.products)
        result.candidates.push({
          source: "audible",
          id: product.asin,
          title: product.title,
          authors: product.authors?.map((a) => a.name) ?? [],
          audioLengthMin: product.runtime_length_min,
        });
    }
  } else result.failures.push(requestFailure("audible", audible.reason));
  return result;
}
function requestFailure(
  source: MetadataFailure["source"],
  error: unknown,
): MetadataFailure {
  // Never expose raw response bodies, request URLs, or credentials in logs.
  return error instanceof CatalogHttpError
    ? { source, code: "http", httpStatus: error.status }
    : { source, code: "request_failed" };
}
