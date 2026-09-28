import { BlobNotFoundError, head, put } from "@vercel/blob";
import { createHash } from "node:crypto";

import { env } from "~/env";

const IMAGE = /(!\[[^\]]*\]\()(https?:\/\/[^)\s]+)\)/g;
/** Images already in a Blob store need no copy. */
const BLOB_HOST = ".public.blob.vercel-storage.com";

/**
 * Where an image lives in the book-notes-images store. Notion serves a file
 * from `/<workspace>/<file id>/<name>` behind a signature that changes on
 * every read; the file id stays fixed until the image is replaced, so it
 * names the blob and a later sync can skip the download. Any other image is
 * named by its address.
 */
export function imagePathname(url: string): string {
  const { pathname } = new URL(url);
  const notion = /^\/[\da-f-]{36}\/([\da-f-]{36})\/([^/]+)$/i.exec(pathname);
  if (notion) {
    const name = decodeURIComponent(notion[2]!).replace(/[^\w.-]+/g, "-");
    return `book-notes/${notion[1]!.toLowerCase()}/${name}`;
  }
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const extension = /\.(\w{3,4})$/.exec(pathname)?.[1] ?? "img";
  return `book-notes/external/${hash}.${extension}`;
}

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok)
    throw new Error(`Image download failed: ${response.status}`);
  return {
    type: response.headers.get("content-type") ?? "image/png",
    body: Buffer.from(await response.arrayBuffer()),
  };
}

/** The image's public Blob URL, uploading it only when it is not there yet. */
async function storedUrl(url: string, token: string): Promise<string> {
  const pathname = imagePathname(url);
  try {
    return (await head(pathname, { token })).url;
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }
  const { type, body } = await download(url);
  const blob = await put(pathname, body, {
    access: "public",
    token,
    contentType: type,
    addRandomSuffix: false,
    allowOverwrite: true,
    // The pathname changes whenever the image does.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

async function dataUri(url: string): Promise<string> {
  const { type, body } = await download(url);
  return `data:${type};base64,${body.toString("base64")}`;
}

/**
 * Point every image in the notes at a copy that outlives Notion's signed
 * links, which expire within the hour: the Blob store when its token is set,
 * otherwise a base64 data URI inside the notes.
 */
export async function persistImages(markdown: string): Promise<string> {
  const urls = [
    ...new Set([...markdown.matchAll(IMAGE)].map((match) => match[2]!)),
  ].filter((url) => !new URL(url).hostname.endsWith(BLOB_HOST));
  const token = env.BLOB_READ_WRITE_TOKEN;
  const persisted = new Map<string, string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (next < urls.length) {
        const url = urls[next++]!;
        persisted.set(
          url,
          token ? await storedUrl(url, token) : await dataUri(url),
        );
      }
    }),
  );
  return markdown.replace(IMAGE, (match, prefix: string, url: string) => {
    const stored = persisted.get(url);
    return stored ? `${prefix}${stored})` : match;
  });
}
