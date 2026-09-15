import { ensureEmoji } from "./ensureEmoji";
import type { CustomEmoji } from "../../../src/lib/bookCoverEmojis/notionEmojiApi";
import { describe, expect, it, vi } from "vitest";

const emoji = (name: string, id: string): CustomEmoji => ({
  id,
  name,
  url: `https://example.test/${id}.png`,
});

const noSleep = () => Promise.resolve();

/** Every emoji image matches unless a test says otherwise. */
const matching = {
  expectedBytes: Buffer.from("cover-bytes"),
  fetchImage: async () => Buffer.from("cover-bytes"),
  imagesMatch: async () => ({ matches: true, difference: 0 }),
};

describe("ensureEmoji", () => {
  it("reuses an emoji already in the library without opening a browser", async () => {
    const upload = vi.fn();
    const result = await ensureEmoji("book-the-body", "/tmp/x.png", {
      ...matching,
      library: new Map([["book-the-body", emoji("book-the-body", "e1")]]),
      refresh: () => Promise.resolve(new Map()),
      upload,
      sleep: noSleep,
    });
    expect(result).toEqual({ emoji: emoji("book-the-body", "e1"), source: "reused" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("registers when the name is absent, then confirms through the API", async () => {
    const library = new Map<string, CustomEmoji>();
    let uploaded = false;
    const result = await ensureEmoji("book-new", "/tmp/x.png", {
      ...matching,
      library,
      refresh: () =>
        Promise.resolve(
          uploaded ? new Map([["book-new", emoji("book-new", "e2")]]) : new Map(),
        ),
      upload: async () => {
        uploaded = true;
      },
      sleep: noSleep,
    });
    expect(result.source).toBe("registered");
    expect(result.emoji.id).toBe("e2");
    expect(library.get("book-new")?.id).toBe("e2");
  });

  it("survives a crash between upload and receipt without duplicating", async () => {
    // First run: uploads, then the process dies before anything is recorded.
    const library = new Map<string, CustomEmoji>();
    const upload = vi.fn(async () => {
      library.set("book-crash", emoji("book-crash", "e3"));
    });
    await ensureEmoji("book-crash", "/tmp/x.png", {
      ...matching,
      library: new Map(),
      refresh: () => Promise.resolve(new Map(library)),
      upload,
      sleep: noSleep,
    });
    expect(upload).toHaveBeenCalledTimes(1);

    // Second run: a fresh worker reads the library and finds it already there.
    const second = await ensureEmoji("book-crash", "/tmp/x.png", {
      ...matching,
      library: new Map(library),
      refresh: () => Promise.resolve(new Map(library)),
      upload,
      sleep: noSleep,
    });
    expect(second.source).toBe("reused");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("polls a few times before giving up, since the API lags the UI", async () => {
    const refresh = vi
      .fn<() => Promise<Map<string, CustomEmoji>>>()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map())
      .mockResolvedValue(new Map([["book-slow", emoji("book-slow", "e4")]]));
    const result = await ensureEmoji("book-slow", "/tmp/x.png", {
      ...matching,
      library: new Map(),
      refresh,
      upload: async () => undefined,
      sleep: noSleep,
      confirmAttempts: 5,
    });
    expect(result.emoji.id).toBe("e4");
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("fails loudly when the API never sees it, naming the workspace risk", async () => {
    await expect(
      ensureEmoji("book-elsewhere", "/tmp/x.png", {
        ...matching,
      library: new Map(),
        refresh: () => Promise.resolve(new Map()),
        upload: async () => undefined,
        sleep: noSleep,
        confirmAttempts: 2,
      }),
    ).rejects.toThrow(/another workspace/);
  });
});

describe("image verification", () => {
  it("refuses a name collision whose picture is a different book", async () => {
    await expect(
      ensureEmoji("book-taken", "/tmp/x.png", {
        ...matching,
        library: new Map([["book-taken", emoji("book-taken", "e9")]]),
        imagesMatch: async () => ({ matches: false, difference: 90 }),
        refresh: () => Promise.resolve(new Map()),
        upload: async () => undefined,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/does not match this cover/);
  });

  it("checks the picture that actually landed after an upload", async () => {
    const library = new Map<string, CustomEmoji>();
    await expect(
      ensureEmoji("book-bad-upload", "/tmp/x.png", {
        ...matching,
        library,
        imagesMatch: async () => ({ matches: false, difference: 77 }),
        refresh: () =>
          Promise.resolve(new Map([["book-bad-upload", emoji("book-bad-upload", "e10")]])),
        upload: async () => undefined,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/stored image does not match/);
  });

  it("does not fetch an image when it has to upload a brand new emoji", async () => {
    let fetched = 0;
    await ensureEmoji("book-fresh", "/tmp/x.png", {
      ...matching,
      library: new Map(),
      fetchImage: async () => {
        fetched += 1;
        return Buffer.from("cover-bytes");
      },
      refresh: () => Promise.resolve(new Map([["book-fresh", emoji("book-fresh", "e11")]])),
      upload: async () => undefined,
      sleep: noSleep,
    });
    // Once, to verify the result. Never to decide whether to upload.
    expect(fetched).toBe(1);
  });
});
