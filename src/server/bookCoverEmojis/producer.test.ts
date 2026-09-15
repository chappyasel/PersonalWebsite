import { createHash } from "node:crypto";
import { expect, it } from "vitest";

import { EmojiStore } from "~/lib/bookCoverEmojis/store";

import { fakeS3 } from "./fakeS3";
import { publishWorkItems } from "./producer";

const bytes = Buffer.from("png");
const input = {
  workId: "book-test",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
  title: "Test",
  author: "A",
  pages: [{ notionId: "p1", bookId: "test" }],
};
const options = {
  workspaceId: "workspace",
  loadAsset: async () => bytes,
  apply: true,
};
function setup() {
  const fake = fakeS3();
  return {
    fake,
    store: new EmojiStore({ bucket: "fake", region: "fake" }, fake.client),
  };
}

it("does not count a failed head write, and resumes after the immutable revision", async () => {
  const { fake, store } = setup();
  fake.failNextHead();
  const failed = await publishWorkItems(store, [input], options);
  expect(failed.created).toBe(0);
  expect(failed.failed).toHaveLength(1);
  expect(await store.getHead(input.workId)).toBeNull();
  const resumed = await publishWorkItems(store, [input], options);
  expect(resumed.failed).toEqual([]);
  expect((await store.getHead(input.workId))?.value.revision).toBe(1);
});

it("recovers an orphan even when newer input has different artwork", async () => {
  const { fake, store } = setup();
  fake.failNextHead();
  await publishWorkItems(store, [input], options);
  const changed = Buffer.from("new");
  const result = await publishWorkItems(
    store,
    [
      {
        ...input,
        sha256: createHash("sha256").update(changed).digest("hex"),
        bytes: changed.length,
      },
    ],
    { ...options, loadAsset: async () => changed },
  );
  expect(result.artworkChanged).toBe(1);
  expect((await store.getHead(input.workId))?.value.emojiRevision).toBe(2);
});

it("concurrent producers never point a head at conflicting immutable content", async () => {
  const { store } = setup();
  const results = await Promise.all([
    publishWorkItems(store, [input], options),
    publishWorkItems(
      store,
      [{ ...input, pages: [{ notionId: "p2", bookId: "reread" }] }],
      options,
    ),
  ]);
  expect(results.reduce((n, result) => n + result.created, 0)).toBe(1);
  expect(results.reduce((n, result) => n + result.contended, 0)).toBe(1);
  const head = (await store.getHead(input.workId))!.value;
  const revision = (await store.getRevision(input.workId, head.revision))!
    .value;
  expect(revision.sha256).toBe(head.sha256);
  expect(revision.pages).toEqual(input.pages);
});

it("rereads change the job revision but retain artwork name; dry-run writes nothing", async () => {
  const { fake, store } = setup();
  await publishWorkItems(store, [input], { ...options, apply: false });
  expect(fake.writes).toEqual([]);
  await publishWorkItems(store, [input], options);
  const original = (await store.getHead(input.workId))!.value;
  const result = await publishWorkItems(
    store,
    [
      {
        ...input,
        pages: [...input.pages, { notionId: "p2", bookId: "reread" }],
      },
    ],
    options,
  );
  expect(result.pagesChanged).toBe(1);
  const head = (await store.getHead(input.workId))!.value;
  expect(head.revision).toBe(2);
  expect(head.emojiName).toBe(original.emojiName);
  expect((await store.getRevision(input.workId, 2))?.value.pages).toHaveLength(
    2,
  );
});

const longInput = {
  ...input,
  workId: "book-a-long-book-title-that-exceeds-the-forty-nine-character-limit",
};

it("counts name-only revisions in dry runs and after persistence without changing artwork", async () => {
  const { fake, store } = setup();
  await publishWorkItems(store, [longInput], { ...options, maxNameLength: 64 });
  const original = (await store.getRevision(longInput.workId, 1))!.value;
  expect(original.emojiName.length).toBeGreaterThan(49);
  const writes = fake.writes.length;
  const dryRun = await publishWorkItems(store, [longInput], {
    ...options,
    apply: false,
  });
  expect(dryRun).toMatchObject({
    nameChanged: 1,
    created: 0,
    artworkChanged: 0,
    pagesChanged: 0,
    unchanged: 0,
    failed: [],
  });
  expect(fake.writes).toHaveLength(writes);
  const applied = await publishWorkItems(store, [longInput], options);
  expect(applied).toMatchObject({
    nameChanged: 1,
    created: 0,
    artworkChanged: 0,
    pagesChanged: 0,
    unchanged: 0,
    failed: [],
  });
  const revision = (await store.getRevision(longInput.workId, 2))!.value;
  expect(revision.emojiName.length).toBeLessThan(50);
  expect(revision.emojiRevision).toBe(original.emojiRevision);
  expect(revision.assetKey).toBe(original.assetKey);
  expect(revision.pages).toEqual(original.pages);
  expect((await store.getRevision(longInput.workId, 1))!.value).toEqual(
    original,
  );
  expect(await publishWorkItems(store, [longInput], options)).toMatchObject({
    nameChanged: 0,
    unchanged: 1,
  });
});

it("does not count a name change before the head write succeeds and resumes that revision", async () => {
  const { fake, store } = setup();
  await publishWorkItems(store, [longInput], { ...options, maxNameLength: 64 });
  fake.failNextHead();
  const failed = await publishWorkItems(store, [longInput], options);
  expect(failed.nameChanged).toBe(0);
  expect(failed.failed).toHaveLength(1);
  expect((await store.getHead(longInput.workId))!.value.revision).toBe(1);
  const resumed = await publishWorkItems(store, [longInput], options);
  expect(resumed.failed).toEqual([]);
  const head = (await store.getHead(longInput.workId))!.value;
  expect(head.revision).toBe(2);
  expect(head.emojiName.length).toBeLessThan(50);
});

it("counts one successful name migration when producers overlap", async () => {
  const { store } = setup();
  await publishWorkItems(store, [longInput], { ...options, maxNameLength: 64 });
  const results = await Promise.all([
    publishWorkItems(store, [longInput], options),
    publishWorkItems(store, [longInput], options),
  ]);
  expect(results.reduce((n, result) => n + result.nameChanged, 0)).toBe(1);
  expect(results.reduce((n, result) => n + result.contended, 0)).toBe(1);
});
