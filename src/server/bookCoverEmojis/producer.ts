/**
 * Turn rendered covers into durable jobs in S3.
 *
 * Shared by the Vercel cron and the local seed command, so the pilot can fill
 * the queue from the covers that already exist without waiting on a deploy.
 * Nothing here touches Notion, a browser, or the local filesystem; the caller
 * supplies bytes and this decides what is new.
 *
 * The head pointer moves last and only with a compare-and-set. If two
 * producers overlap, the loser sees the precondition fail and leaves that book
 * for the next run rather than writing a revision the head never points at.
 */
import { assetKey } from "~/lib/bookCoverEmojis/keys";
import {
  type EmojiStore,
  PreconditionFailed,
} from "~/lib/bookCoverEmojis/store";
import {
  type WorkInput,
  type WorkRevision,
  planWorkItem,
} from "~/lib/bookCoverEmojis/work";

export type ProducerResult = {
  created: number;
  artworkChanged: number;
  pagesChanged: number;
  nameChanged: number;
  unchanged: number;
  contended: number;
  failed: Array<{ workId: string; error: string }>;
};

export type ProducerOptions = {
  workspaceId: string;
  /** Returns the PNG for a work item, only called when it may need storing. */
  loadAsset: (input: WorkInput) => Promise<Buffer>;
  now?: () => string;
  maxNameLength?: number;
  /** Dry run reports what would change and writes nothing. */
  apply: boolean;
};

export async function publishWorkItems(
  store: EmojiStore,
  inputs: readonly WorkInput[],
  options: ProducerOptions,
): Promise<ProducerResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const result: ProducerResult = {
    created: 0,
    artworkChanged: 0,
    pagesChanged: 0,
    nameChanged: 0,
    unchanged: 0,
    contended: 0,
    failed: [],
  };

  for (const input of inputs) {
    try {
      let head = await store.getHead(input.workId);
      // Finish an interrupted immutable write before planning newer input.
      // This also prevents a different later cover from poisoning that slot.
      const orphan = await store.getRevision(
        input.workId,
        (head?.value.revision ?? 0) + 1,
      );
      if (orphan && options.apply) {
        const value = orphan.value;
        if (value.workspaceId !== options.workspaceId)
          throw new Error("workspace mismatch");
        await store.putHead(
          {
            workId: value.workId,
            revision: value.revision,
            emojiRevision: value.emojiRevision,
            emojiName: value.emojiName,
            sha256: value.sha256,
            updatedAt: value.createdAt,
          },
          head?.etag ?? null,
        );
        head = await store.getHead(input.workId);
      }
      const previous: WorkRevision | null = head
        ? ((await store.getRevision(input.workId, head.value.revision))
            ?.value ?? null)
        : null;

      if (head && !previous) throw new Error("head revision is missing");
      if (previous && previous.workspaceId !== options.workspaceId)
        throw new Error("workspace mismatch");
      const planned = planWorkItem(
        input,
        head?.value ?? null,
        previous,
        options.workspaceId,
        now(),
        assetKey,
        options.maxNameLength,
      );

      if (planned.change === "unchanged" || !planned.revision) {
        result.unchanged += 1;
        continue;
      }
      if (options.apply) {
        // Asset first: a revision must never point at bytes that are not there.
        await store.putAssetIfAbsent(
          input.sha256,
          await options.loadAsset(input),
        );
        await store.putRevision(planned.revision);
        await store.putHead(planned.head, head?.etag ?? null);
      }
      if (planned.change === "created") result.created += 1;
      if (planned.change === "artwork") result.artworkChanged += 1;
      if (planned.change === "pages") result.pagesChanged += 1;
      if (planned.change === "name") result.nameChanged += 1;
    } catch (error) {
      if (error instanceof PreconditionFailed) {
        result.contended += 1;
        continue;
      }
      result.failed.push({
        workId: input.workId,
        error: "work publication failed",
      });
    }
  }

  return result;
}
