import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";

import { fakeS3 } from "~/server/bookCoverEmojis/fakeS3";

import { assetKey } from "./keys";
import { EmojiStore, PreconditionFailed } from "./store";
import { planWorkItem } from "./work";

it("resumes equivalent immutable revisions but rejects different pages, artwork, or workspace", async () => {
  const fake = fakeS3();
  const store = new EmojiStore({ bucket: "fake", region: "fake" }, fake.client);
  const revision = planWorkItem(
    {
      workId: "book-test",
      sha256: "a",
      bytes: 1,
      title: "Test",
      author: "A",
      pages: [{ notionId: "p1", bookId: "test" }],
    },
    null,
    null,
    "workspace",
    "day1",
    assetKey,
  ).revision!;
  await store.putRevision(revision);
  await store.putRevision({ ...revision, createdAt: "day2" });
  for (const change of [
    { pages: [] },
    { sha256: "b" },
    { workspaceId: "elsewhere" },
  ]) {
    await expect(
      store.putRevision({ ...revision, ...change }),
    ).rejects.toBeInstanceOf(PreconditionFailed);
  }
  expect((await store.getRevision("book-test", 1))?.value).toEqual(revision);
  expect(fake.writes.every((write) => write.IfNoneMatch === "*")).toBe(true);
});

it("uses create-only and ETag conditions for heads, confines keys, verifies digest bytes", async () => {
  const fake = fakeS3();
  const store = new EmojiStore({ bucket: "fake", region: "fake" }, fake.client);
  const head = {
    workId: "book-test",
    revision: 1,
    emojiRevision: 1,
    emojiName: "book-test",
    sha256: "a",
    updatedAt: "now",
  };
  await store.putHead(head, null);
  await expect(store.putHead(head, null)).rejects.toBeInstanceOf(
    PreconditionFailed,
  );
  const loaded = (await store.getHead(head.workId))!;
  await store.putHead({ ...head, revision: 2 }, loaded.etag);
  await expect(store.putHead(head, loaded.etag)).rejects.toBeInstanceOf(
    PreconditionFailed,
  );
  await expect(store.putHead(head, "")).rejects.toThrow("ETag");
  const png = Buffer.from("png");
  const digest = createHash("sha256").update(png).digest("hex");
  expect(await store.putAssetIfAbsent(digest, png)).toBe("stored");
  expect(await store.putAssetIfAbsent(digest, png)).toBe("present");
  await expect(
    store.putAssetIfAbsent(digest, Buffer.from("other")),
  ).rejects.toThrow("digest");
  await expect(store.getBytes("other/file")).rejects.toThrow();
  await expect(store.putSource("../escape", {})).rejects.toThrow();
  expect(
    fake.writes.every((write) => write.Key?.startsWith("book-cover-emojis/")),
  ).toBe(true);
});

it("does not treat a 409 without a stored object as a successful immutable write", async () => {
  const fake = fakeS3();
  vi.spyOn(fake.client, "send").mockRejectedValueOnce(
    Object.assign(new Error("conflict"), {
      $metadata: { httpStatusCode: 409 },
    }),
  );
  const store = new EmojiStore({ bucket: "fake", region: "fake" }, fake.client);
  const revision = planWorkItem(
    {
      workId: "book-test",
      sha256: "a",
      bytes: 1,
      title: "Test",
      author: "A",
      pages: [],
    },
    null,
    null,
    "workspace",
    "now",
    assetKey,
  ).revision!;
  await expect(store.putRevision(revision)).rejects.toBeInstanceOf(
    PreconditionFailed,
  );
});
