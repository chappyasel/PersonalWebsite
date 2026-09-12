import crypto from "node:crypto";

// Node 24 loads this pure TypeScript serializer directly. Use the runtime
// function so packaging and the mounted room cannot project different fields.
/** @type {typeof import("../../src/app/components/stacks/illustration/artwork/booksIdentity")} */
const { serializeRoomBooksArtworkIdentity } = await import(
  new URL(
    "../../src/app/components/stacks/illustration/artwork/booksIdentity.ts",
    import.meta.url,
  ).href
);

/**
 * @typedef {{
 *   unit: string,
 *   requiresDataIdentity: boolean,
 *   capturedDataSha256: string | null,
 *   dataIdentity?: {
 *     version: number,
 *     previous: {
 *       version: number,
 *       capturedDataSha256: string,
 *       preimage: {path: string, sha256: string}
 *     }
 *   }
 * }} BooksCapture
 */

/** @param {string | Uint8Array} bytes */
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/**
 * Derive v2 only from the exact preimage of the previously approved v1 hash.
 * @param {BooksCapture} capture
 * @param {(file: string) => Promise<Buffer>} read
 */
export async function verifyCapturedBooksIdentity(capture, read) {
  if (capture.unit !== "books") return;
  const previous = capture.dataIdentity?.previous;
  if (
    !capture.requiresDataIdentity ||
    capture.dataIdentity?.version !== 2 ||
    previous?.version !== 1 ||
    previous.preimage.path !== "captured-source/books-identity-v1.json" ||
    previous.preimage.sha256 !== previous.capturedDataSha256
  )
    throw new Error(
      "Missing or mismatched Books identity migration provenance",
    );

  const bytes = await read(previous.preimage.path);
  if (hash(bytes) !== previous.capturedDataSha256)
    throw new Error(
      "Books preimage differs from the approved version 1 identity",
    );
  /** @type {Parameters<typeof serializeRoomBooksArtworkIdentity>[0] & {version: number}} */
  const original = JSON.parse(bytes.toString());
  if (original.version !== 1)
    throw new Error("Books identity preimage is not version 1");
  if (
    hash(serializeRoomBooksArtworkIdentity(original)) !==
    capture.capturedDataSha256
  )
    throw new Error(
      "Books version 2 identity differs from the approved content",
    );
}
