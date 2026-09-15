/**
 * The S3 side of the pipeline.
 *
 * There is no queue any more. One Vercel cron does the whole job — render,
 * upload, apply — so the immutable-revision and compare-and-set head pointer
 * that used to coordinate a separate local worker have no second party left to
 * coordinate with. What remains is durable memory, in two shapes:
 *
 *   sources/<workId>.json what this book looked like last time, and which
 *                         Notion upload already holds its artwork
 *   pages/<notionId>.json what the automation set on one page, and crucially
 *                         what was there before it ever touched it
 *
 * The rendered PNG itself is deliberately not kept here. Once an upload is
 * attached it is permanent and re-attachable by id, and the render is
 * deterministic from the cover URL, so a second copy would be one more thing
 * to keep in step for no question it can answer.
 *
 * The page record is the only thing standing between this automation and
 * quietly overwriting an icon a person chose. It is written before the PATCH,
 * not after, so a crash mid-write leaves evidence rather than a mystery.
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { OwnedIcon } from "./iconPolicy";
import { catalogKey, confine, pageKey, pagePrefix, sourceKey } from "./keys";

export type StoreConfig = { bucket: string; region: string };

export type Loaded<T> = { value: T; etag: string };

/** What the pipeline last knew about one book. */
export type SourceRecord = {
  workId: string;
  /** Covers the cover URL, the page set, and the renderer. Not note edits. */
  fingerprint: string;
  /** Digest of the rendered PNG. */
  sha256: string;
  /**
   * The Notion FileUpload holding this artwork, once something is attached to
   * it. An upload nobody has attached expires in an hour, so it is never
   * recorded here until at least one page wears it.
   */
  uploadId: string | null;
  /** The icon identity that upload produces, for comparing against a read. */
  icon: OwnedIcon | null;
  /**
   * Pages that need nothing further at this artwork: applied, stood down as
   * somebody's own icon, or failed past the attempt limit. Kept on the source
   * so an unchanged book can be recognised without reading every page record.
   */
  settled: string[];
  checkedAt: number;
};

/**
 * What the automation did to one page.
 *
 * `state` is written as "intent" before the PATCH and settled afterwards. If
 * the process dies in between, the next run finds the intent, reads the live
 * icon, and can tell "we already set it" from "we never got there" without
 * ever mistaking the icon it just set for the original.
 */
export type PageRecord = {
  notionId: string;
  workId: string;
  state: "intent" | "applied" | "manual" | "failed";
  /** The artwork this record settles. New artwork reopens a settled page. */
  sha256: string;
  /** What the automation put here, once it is confirmed to be there. */
  owned: OwnedIcon | null;
  /** What it was about to put here. Meaningful while state is "intent". */
  target: OwnedIcon | null;
  uploadId: string | null;
  /**
   * The icon from before the automation first touched this page, verbatim, so
   * the change can be undone. Written once and never overwritten: a later run
   * that replaces its own icon must not record that icon as the original.
   */
  originalIcon: unknown;
  originalIconDescribed: string;
  /** How many runs have tried this page at this artwork. */
  attempts: number;
  at: string;
  /** Already redacted before it gets here. */
  error?: string;
};

/**
 * How many runs may try one page before it stops taking a slot. A page that
 * fails forever would otherwise be picked first every run and never let the
 * rest of the catalog through.
 */
export const MAX_PAGE_ATTEMPTS = 3;

export class EmojiStore {
  private readonly client: S3Client;

  constructor(
    private readonly config: StoreConfig,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        region: config.region,
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 },
      });
  }

  private async getJson<T>(key: string): Promise<Loaded<T> | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: confine(key) }),
      );
      const body = await response.Body?.transformToString();
      if (!body) return null;
      return { value: JSON.parse(body) as T, etag: response.ETag ?? "" };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  private async putJson(key: string, value: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: confine(key),
        Body: JSON.stringify(value, null, 2),
        ContentType: "application/json",
      }),
    );
  }

  async getBytes(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: confine(key) }),
      );
      const bytes = await response.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  // These are `async` so that a rejected key validates as a rejected promise
  // rather than a synchronous throw. A caller reaching for `.catch()` on what
  // the signature calls a Promise should not be stepped past by a bad id.
  async getSource(workId: string): Promise<Loaded<SourceRecord> | null> {
    return this.getJson<SourceRecord>(sourceKey(workId));
  }

  async putSource(source: SourceRecord): Promise<void> {
    return this.putJson(sourceKey(source.workId), source);
  }

  async getPage(notionId: string): Promise<Loaded<PageRecord> | null> {
    return this.getJson<PageRecord>(pageKey(notionId));
  }

  async putPage(record: PageRecord): Promise<void> {
    return this.putJson(pageKey(record.notionId), record);
  }

  /** Every page the automation has a record for. Used by status and verify. */
  async listPageIds(): Promise<string[]> {
    const ids: string[] = [];
    let token: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: pagePrefix(),
          ContinuationToken: token,
        }),
      );
      for (const entry of response.Contents ?? []) {
        const id = entry.Key?.slice(pagePrefix().length).replace(/\.json$/, "");
        if (id) ids.push(id);
      }
      token = response.NextContinuationToken;
    } while (token);
    return ids.sort();
  }

  getCatalog<T>(): Promise<Loaded<T> | null> {
    return this.getJson<T>(catalogKey());
  }

  putCatalog(summary: unknown): Promise<void> {
    return this.putJson(catalogKey(), summary);
  }
}
