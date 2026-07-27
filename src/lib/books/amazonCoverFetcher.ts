import sharp from "sharp";

const AMAZON_IMAGE_HOSTS = new Set([
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
]);
const AMAZON_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
};
const OPEN_LIBRARY_HEADERS = {
  "user-agent": "PersonalWebsiteBookCoverFetcher/1.0",
};
const MAX_SEARCH_DOCS = 3;
const MAX_EDITION_LOOKUPS = 12;
const MAX_AMAZON_CANDIDATES = 8;

type OpenLibrarySearchResponse = {
  docs?: Array<{
    author_name?: string[];
    isbn?: string[];
    title?: string;
  }>;
};

type OpenLibraryEdition = {
  languages?: Array<{ key?: string }>;
  physical_format?: string;
  title?: string;
};

type EditionCandidate = {
  isbn: string;
  score: number;
};

type AmazonSearchCandidate = {
  asin: string;
};

type CoverDimensions = {
  height: number;
  width: number;
};

type AmazonCoverFetcherOptions = {
  fetchImpl?: typeof fetch;
  probeImage?: (
    url: string,
    fetchImpl: typeof fetch,
  ) => Promise<CoverDimensions | null>;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleMatches(candidate: string, wanted: string): boolean {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedWanted = normalizeText(wanted);
  if (!normalizedCandidate || !normalizedWanted) return false;
  if (normalizedCandidate === normalizedWanted) return true;

  // Single-word titles such as "Power" must not match a different book such
  // as "7 Rules of Power". Longer titles can safely match subtitle variants.
  if (!normalizedWanted.includes(" ")) return false;

  return (
    normalizedCandidate.includes(normalizedWanted) ||
    normalizedWanted.includes(normalizedCandidate)
  );
}

function authorMatches(candidate: string, wanted: string): boolean {
  const surname = normalizeText(wanted).split(" ").filter(Boolean).at(-1);
  return Boolean(
    surname && normalizeText(candidate).split(" ").includes(surname),
  );
}

function cleanIsbn(value: string): string | null {
  const isbn = value.replace(/[^0-9X]/gi, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn) || /^\d{13}$/.test(isbn)) return isbn;
  return null;
}

export function isEligiblePrintEdition(edition: OpenLibraryEdition): boolean {
  const languages = (edition.languages ?? [])
    .map((language) => language.key?.split("/").at(-1))
    .filter(Boolean);
  if (languages.length > 0 && !languages.includes("eng")) return false;

  const format = normalizeText(edition.physical_format ?? "");
  return !/\b(audio|audiobook|mp3|cd|electronic|ebook|kindle)\b/.test(format);
}

function rankEdition(isbn: string, edition: OpenLibraryEdition): number {
  const languages = (edition.languages ?? [])
    .map((language) => language.key?.split("/").at(-1))
    .filter(Boolean);
  const format = normalizeText(edition.physical_format ?? "");

  let score = 0;
  if (languages.includes("eng")) score += 4;
  if (/\b(hardcover|hardback|paperback|binding|book)\b/.test(format))
    score += 3;
  if (isbn.length === 10) score += 1;
  return score;
}

async function findPrintEditionCandidates(
  title: string,
  author: string,
  fetchImpl: typeof fetch,
): Promise<EditionCandidate[]> {
  const params = new URLSearchParams({
    author,
    fields: "title,author_name,isbn",
    limit: String(MAX_SEARCH_DOCS),
    title,
  });
  const response = await fetchImpl(
    `https://openlibrary.org/search.json?${params.toString()}`,
    { headers: OPEN_LIBRARY_HEADERS },
  );
  if (!response.ok) return [];

  const data = (await response.json()) as OpenLibrarySearchResponse;
  const isbnCandidates = [
    ...new Set(
      (data.docs ?? [])
        .filter(
          (doc) =>
            Boolean(doc.title && titleMatches(doc.title, title)) &&
            (doc.author_name ?? []).some((name) => authorMatches(name, author)),
        )
        .flatMap((doc) => doc.isbn ?? [])
        .map(cleanIsbn)
        .filter((isbn): isbn is string => isbn !== null),
    ),
  ]
    .sort((a, b) => a.length - b.length)
    .slice(0, MAX_EDITION_LOOKUPS);

  // Open Library rate-limits bursts of ISBN detail requests. Keep these
  // sequential so a single new-book sync remains polite and reliable.
  const editions: EditionCandidate[] = [];
  for (const isbn of isbnCandidates) {
    try {
      const editionResponse = await fetchImpl(
        `https://openlibrary.org/isbn/${isbn}.json`,
        { headers: OPEN_LIBRARY_HEADERS },
      );
      if (!editionResponse.ok) continue;

      const edition = (await editionResponse.json()) as OpenLibraryEdition;
      if (
        !edition.title ||
        !titleMatches(edition.title, title) ||
        !isEligiblePrintEdition(edition)
      ) {
        continue;
      }

      editions.push({ isbn, score: rankEdition(isbn, edition) });
    } catch {
      // A missing edition should not prevent trying another ISBN.
    }
  }

  return editions
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_AMAZON_CANDIDATES);
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string): string {
  return decodeHtmlAttribute(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function parseAmazonSearchResults(
  html: string,
  title: string,
  author: string,
): AmazonSearchCandidate[] {
  const starts = [
    ...html.matchAll(
      /<div\b[^>]*data-asin=["']([^"']+)["'][^>]*data-component-type=["']s-search-result["'][^>]*>/gi,
    ),
  ];
  const candidates: AmazonSearchCandidate[] = [];

  for (const [index, start] of starts.entries()) {
    if (start.index === undefined || !start[1]) continue;
    const end = starts[index + 1]?.index ?? html.length;
    const block = html.slice(start.index, end);
    const resultTitleMatch = /<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)/i.exec(block);
    const resultTitle = decodeHtmlAttribute(
      resultTitleMatch?.[1]?.trim() ?? "",
    );
    const resultText = stripHtml(block);

    if (
      resultTitle &&
      titleMatches(resultTitle, title) &&
      authorMatches(resultText, author) &&
      !/^summary of\b/i.test(resultTitle)
    ) {
      candidates.push({ asin: start[1] });
      if (candidates.length === 3) break;
    }
  }

  return candidates;
}

export function parseAmazonPrintFormatAsins(html: string): string[] {
  const asins: string[] = [];
  const linkPattern =
    /<a\b[^>]*href=["'][^"']*\/(?:dp|gp\/aw\/d)\/([A-Z0-9]{10})[^"']*["'][^>]*>[\s\S]{0,800}?aria-label=["'](?:Hardcover|Hardback|Paperback|Mass Market Paperback|Spiral-bound|Board book) Format:/gi;

  for (const match of html.matchAll(linkPattern)) {
    if (match[1] && !asins.includes(match[1])) asins.push(match[1]);
  }

  return asins;
}

export function parseAmazonProductPage(html: string): {
  hiResUrl: string;
  pageTitle: string;
} | null {
  const pageTitleMatch = /<title[^>]*>([^<]*)/i.exec(html);
  const pageTitle = decodeHtmlAttribute(pageTitleMatch?.[1]?.trim() ?? "");
  const landingImageMatch =
    /<img\b[^>]*\bid=["'](?:landingImage|main-image)["'][^>]*>/i.exec(html);
  const landingImage = landingImageMatch?.[0] ?? "";
  const landingImageUrlMatch =
    /\bdata-(?:old-hires|a-hires)=["']([^"']+)["']/i.exec(landingImage);
  const fallbackImageUrlMatch = /["']hiRes["']\s*:\s*["']([^"']+)["']/i.exec(
    html,
  );
  const hiResUrl = landingImageUrlMatch?.[1] ?? fallbackImageUrlMatch?.[1];

  if (!pageTitle || !hiResUrl) return null;
  return { hiResUrl: decodeHtmlAttribute(hiResUrl), pageTitle };
}

export function amazonProductMatchesBook(
  pageTitle: string,
  title: string,
  author: string,
): boolean {
  if (/\b(audible|audiobook|kindle)\b/i.test(pageTitle)) return false;

  const productTitle = pageTitle
    .replace(/^amazon\.com\s*:\s*/i, "")
    .split(":")[0]
    ?.trim();
  return Boolean(
    productTitle &&
      titleMatches(productTitle, title) &&
      authorMatches(pageTitle, author),
  );
}

export function normalizeAmazonImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!AMAZON_IMAGE_HOSTS.has(url.hostname)) return null;

    url.protocol = "https:";
    url.pathname = url.pathname.replace(
      /\._[^/]+_(?=\.(?:jpe?g|png|webp)$)/i,
      "",
    );
    return url.toString();
  } catch {
    return null;
  }
}

export function isAcceptableCoverDimensions({
  height,
  width,
}: CoverDimensions): boolean {
  if (width < 600 || height < 900) return false;
  const aspectRatio = height / width;
  return aspectRatio >= 1.2 && aspectRatio <= 2.2;
}

async function probeImageDimensions(
  url: string,
  fetchImpl: typeof fetch,
): Promise<CoverDimensions | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.startsWith("image/")) return null;

    const metadata = await sharp(
      Buffer.from(await response.arrayBuffer()),
    ).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { height: metadata.height, width: metadata.width };
  } catch {
    return null;
  }
}

async function coverFromAmazonProductHtml(
  html: string,
  title: string,
  author: string,
  fetchImpl: typeof fetch,
  probeImage: (
    url: string,
    fetchImpl: typeof fetch,
  ) => Promise<CoverDimensions | null>,
): Promise<string | null> {
  const product = parseAmazonProductPage(html);
  if (!product || !amazonProductMatchesBook(product.pageTitle, title, author)) {
    return null;
  }

  const dimensions = await probeImage(product.hiResUrl, fetchImpl);
  if (!dimensions || !isAcceptableCoverDimensions(dimensions)) return null;
  return normalizeAmazonImageUrl(product.hiResUrl);
}

async function fetchFromAmazonSearch(
  title: string,
  author: string,
  fetchImpl: typeof fetch,
  probeImage: (
    url: string,
    fetchImpl: typeof fetch,
  ) => Promise<CoverDimensions | null>,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      i: "stripbooks",
      k: `${title} ${author}`,
    });
    const searchResponse = await fetchImpl(
      `https://www.amazon.com/s?${params.toString()}`,
      { headers: AMAZON_HEADERS },
    );
    if (!searchResponse.ok) return null;

    const candidates = parseAmazonSearchResults(
      await searchResponse.text(),
      title,
      author,
    );
    for (const candidate of candidates) {
      const primaryResponse = await fetchImpl(
        `https://www.amazon.com/dp/${candidate.asin}`,
        { headers: AMAZON_HEADERS },
      );
      if (!primaryResponse.ok) continue;

      const primaryHtml = await primaryResponse.text();
      const primaryCover = await coverFromAmazonProductHtml(
        primaryHtml,
        title,
        author,
        fetchImpl,
        probeImage,
      );
      if (primaryCover) return primaryCover;

      for (const printAsin of parseAmazonPrintFormatAsins(primaryHtml)) {
        const printResponse = await fetchImpl(
          `https://www.amazon.com/dp/${printAsin}`,
          { headers: AMAZON_HEADERS },
        );
        if (!printResponse.ok) continue;

        const printCover = await coverFromAmazonProductHtml(
          await printResponse.text(),
          title,
          author,
          fetchImpl,
          probeImage,
        );
        if (printCover) return printCover;
      }
    }
  } catch {
    // Open Library ISBN discovery below remains available as a fallback.
  }

  return null;
}

export async function fetchAmazonPrintCover(
  title: string,
  author: string,
  options: AmazonCoverFetcherOptions = {},
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const probeImage = options.probeImage ?? probeImageDimensions;

  try {
    const searchedCover = await fetchFromAmazonSearch(
      title,
      author,
      fetchImpl,
      probeImage,
    );
    if (searchedCover) return searchedCover;

    const candidates = await findPrintEditionCandidates(
      title,
      author,
      fetchImpl,
    );

    for (const candidate of candidates) {
      try {
        const response = await fetchImpl(
          `https://www.amazon.com/dp/${candidate.isbn}`,
          { headers: AMAZON_HEADERS },
        );
        if (!response.ok) continue;

        const originalUrl = await coverFromAmazonProductHtml(
          await response.text(),
          title,
          author,
          fetchImpl,
          probeImage,
        );
        if (originalUrl) return originalUrl;
      } catch {
        // A single bad edition should not prevent trying the next ISBN.
      }
    }
  } catch (error) {
    console.error("Error fetching from Amazon:", error);
  }

  return null;
}
