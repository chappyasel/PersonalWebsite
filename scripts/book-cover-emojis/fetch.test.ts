import { fetchCover } from "./fetch";
import { positiveInt, resolveOutDir } from "./cli";
import { describe, expect, it, vi } from "vitest";

/** A response whose body arrives in chunks, so the size ceiling has to act
 * mid-stream rather than after the fact. */
function streamed(chunks: Uint8Array[], init: ResponseInit = {}): Response {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index++]);
    },
  });
  return new Response(stream, { status: 200, ...init });
}

const chunk = (size: number) => new Uint8Array(size).fill(1);
const noSleep = () => Promise.resolve();

describe("size ceiling", () => {
  it("stops reading once the body passes the ceiling", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 50) {
          controller.close();
          return;
        }
        controller.enqueue(chunk(100));
      },
    });
    const result = await fetchCover("https://example.test/big.jpg", {
      maxBytes: 250,
      attempts: 1,
      sleep: noSleep,
      fetchImpl: async () => new Response(stream, { status: 200 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too large/);
    // Three 100-byte chunks pass 250; the rest of the body is never pulled.
    expect(pulled).toBeLessThanOrEqual(4);
  });

  it("rejects a body whose advertised length is already over the ceiling", async () => {
    const result = await fetchCover("https://example.test/huge.jpg", {
      maxBytes: 100,
      attempts: 1,
      sleep: noSleep,
      fetchImpl: async () =>
        streamed([chunk(10)], { headers: { "content-length": "999999" } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/advertised/);
  });

  it("accepts a body that fits", async () => {
    const result = await fetchCover("https://example.test/ok.jpg", {
      maxBytes: 1000,
      attempts: 1,
      sleep: noSleep,
      fetchImpl: async () => streamed([chunk(100), chunk(100)]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toHaveLength(200);
  });
});

describe("failure handling", () => {
  it("retries a 503 and reports success on a later attempt", async () => {
    let calls = 0;
    const result = await fetchCover("https://example.test/flaky.jpg", {
      attempts: 3,
      sleep: noSleep,
      fetchImpl: async () => {
        calls += 1;
        return calls < 3 ? new Response("", { status: 503 }) : streamed([chunk(64)]);
      },
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it("does not retry a 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    const result = await fetchCover("https://example.test/gone.jpg", {
      attempts: 3,
      sleep: noSleep,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("http 404");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget and returns a reason, never throws", async () => {
    const result = await fetchCover("https://example.test/down.jpg", {
      attempts: 2,
      sleep: noSleep,
      fetchImpl: async () => {
        throw new Error("network unreachable");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/network unreachable/);
      expect(result.attempts).toBe(2);
    }
  });

  it("treats an empty body as a failure rather than a zero-byte cover", async () => {
    const result = await fetchCover("https://example.test/empty.jpg", {
      attempts: 1,
      sleep: noSleep,
      fetchImpl: async () => streamed([]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/);
  });
});

describe("numeric flags", () => {
  it("keeps the default when the flag is absent", () => {
    expect(positiveInt(undefined, 6, "concurrency")).toBe(6);
  });

  it("accepts a positive whole number", () => {
    expect(positiveInt("12", 6, "concurrency")).toBe(12);
  });

  it("refuses a negative worker count instead of running no workers", () => {
    expect(() => positiveInt("-4", 6, "concurrency")).toThrow(/positive whole number/);
  });

  it("refuses zero, a fraction, and text", () => {
    expect(() => positiveInt("0", 6, "concurrency")).toThrow();
    expect(() => positiveInt("2.5", 6, "concurrency")).toThrow();
    expect(() => positiveInt("lots", 6, "concurrency")).toThrow();
    expect(() => positiveInt("", 6, "concurrency")).toThrow();
  });
});

describe("where a run writes", () => {
  const out = "/tmp/book-cover-emojis";

  it("uses the output directory itself for a full run", () => {
    expect(resolveOutDir(out, 0)).toBe(out);
  });

  it("routes a subset into its own directory, never the full output", () => {
    expect(resolveOutDir(out, 12)).toBe("/tmp/book-cover-emojis/subsets/limit-12");
    expect(resolveOutDir(out, 12)).not.toBe(out);
  });

  it("keeps two different subsets apart", () => {
    expect(resolveOutDir(out, 12)).not.toBe(resolveOutDir(out, 40));
  });

  it("isolates a subset even when --out was given explicitly", () => {
    expect(resolveOutDir("/somewhere/else", 5)).toBe(
      "/somewhere/else/subsets/limit-5",
    );
  });
});
