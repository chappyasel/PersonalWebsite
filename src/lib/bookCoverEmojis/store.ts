/**
 * The S3 side of the queue.
 *
 * Immutable revision objects plus a tiny mutable head pointer, which is all
 * the coordination this needs: one producer writes, one local worker reads,
 * and a singleton lock on the worker's machine stops it racing itself. The
 * head moves with a compare-and-set so a producer that runs twice cannot
 * interleave two revisions, and receipts are create-only so a retry cannot
 * overwrite the record of what already happened.
 *
 * Both conditions are real in the SDK: PutObjectRequest carries IfMatch and
 * IfNoneMatch in @aws-sdk/client-s3 3.995.0.
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  assertSegment,
  assetKey,
  catalogKey,
  confine,
  headKey,
  receiptKey,
  revisionKey,
  workPrefix,
} from "./keys";
import type { WorkHead, WorkRevision } from "./work";

export type StoreConfig = { bucket: string; region: string };

export type Loaded<T> = { value: T; etag: string };

export class PreconditionFailed extends Error {
  constructor(key: string) {
    super(`another writer moved ${key} first`);
    this.name = "PreconditionFailed";
  }
}

function isPrecondition(error: unknown): boolean {
  const code = (
    error as { name?: string; $metadata?: { httpStatusCode?: number } }
  )?.$metadata?.httpStatusCode;
  const name = (error as { name?: string })?.name;
  return code === 412 || code === 409 || name === "PreconditionFailed";
}

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
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
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

  /** Upload an asset only if that digest is not already stored. */
  async putAssetIfAbsent(
    sha256: string,
    bytes: Buffer,
  ): Promise<"stored" | "present"> {
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
      throw new Error("asset digest mismatch");
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: assetKey(sha256),
          Body: bytes,
          ContentType: "image/png",
          IfNoneMatch: "*",
        }),
      );
      return "stored";
    } catch (error) {
      if (isPrecondition(error)) {
        const stored = await this.getBytes(assetKey(sha256));
        if (stored?.equals(bytes)) return "present";
        throw new PreconditionFailed(assetKey(sha256));
      }
      throw error;
    }
  }

  async putRevision(revision: WorkRevision): Promise<void> {
    // Ignore only the creation timestamp when resuming equivalent content.
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: revisionKey(revision.workId, revision.revision),
          Body: JSON.stringify(revision, null, 2),
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      if (isPrecondition(error)) {
        const existing = await this.getRevision(
          revision.workId,
          revision.revision,
        );
        if (existing) {
          if (
            isDeepStrictEqual(
              { ...existing.value, createdAt: revision.createdAt },
              revision,
            )
          )
            return;
        }
        throw new PreconditionFailed(
          revisionKey(revision.workId, revision.revision),
        );
      }
      throw error;
    }
  }

  getHead(workId: string): Promise<Loaded<WorkHead> | null> {
    return this.getJson<WorkHead>(headKey(workId));
  }

  getRevision(
    workId: string,
    revision: number,
  ): Promise<Loaded<WorkRevision> | null> {
    return this.getJson<WorkRevision>(revisionKey(workId, revision));
  }

  /**
   * Move the head pointer, but only if it still looks the way the caller last
   * saw it. `expectedEtag` of null means "create it, and fail if it exists".
   */
  async putHead(head: WorkHead, expectedEtag: string | null): Promise<void> {
    const key = headKey(head.workId);
    if (expectedEtag === "") throw new Error("head ETag is missing");
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: JSON.stringify(head, null, 2),
          ContentType: "application/json",
          ...(expectedEtag === null
            ? { IfNoneMatch: "*" }
            : { IfMatch: expectedEtag }),
        }),
      );
    } catch (error) {
      if (isPrecondition(error)) throw new PreconditionFailed(key);
      throw error;
    }
  }

  /** Receipts never overwrite. A repeat attempt gets the next attempt number. */
  async putReceipt(
    workId: string,
    revision: number,
    attempt: number,
    receipt: unknown,
  ): Promise<"written" | "exists"> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: receiptKey(workId, revision, attempt),
          Body: JSON.stringify(receipt, null, 2),
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
      );
      return "written";
    } catch (error) {
      if (isPrecondition(error)) return "exists";
      throw error;
    }
  }

  async listWorkIds(): Promise<string[]> {
    const ids = new Set<string>();
    let token: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: workPrefix(),
          Delimiter: "/",
          ContinuationToken: token,
        }),
      );
      for (const entry of response.CommonPrefixes ?? []) {
        const id = entry.Prefix?.slice(workPrefix().length).replace(/\/$/, "");
        if (id) ids.add(id);
      }
      token = response.NextContinuationToken;
    } while (token);
    return [...ids].sort();
  }

  getSource<T>(workId: string): Promise<Loaded<T> | null> {
    return this.getJson<T>(
      confine(
        `book-cover-emojis/sources/${assertSegment(workId, "workId")}.json`,
      ),
    );
  }

  async putSource(workId: string, source: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: confine(
          `book-cover-emojis/sources/${assertSegment(workId, "workId")}.json`,
        ),
        Body: JSON.stringify(source),
        ContentType: "application/json",
      }),
    );
  }

  async putCatalog(summary: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: catalogKey(),
        Body: JSON.stringify(summary, null, 2),
        ContentType: "application/json",
      }),
    );
  }

  getCatalog<T>(): Promise<Loaded<T> | null> {
    return this.getJson<T>(catalogKey());
  }
}
