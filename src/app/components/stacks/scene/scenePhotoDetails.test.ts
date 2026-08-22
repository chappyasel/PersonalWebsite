import { describe, expect, it, vi } from "vitest";

import { createDetailResourceLoader } from "./scenePhotoDetails";

function deferred<Resource>() {
  let resolve!: (resource: Resource) => void;
  const promise = new Promise<Resource>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe("detail resource loader", () => {
  it("aborts and disposes a detail that resolves after its last lease releases", async () => {
    const pending = deferred<{ dispose: () => void }>();
    let signal: AbortSignal | undefined;
    const loader = createDetailResourceLoader((_url, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    });
    const detail = { dispose: vi.fn() };
    const lease = loader.request("detail.jpg");

    lease.release();
    expect(signal?.aborted).toBe(true);
    expect(loader.has("detail.jpg")).toBe(false);
    pending.resolve(detail);

    await expect(lease.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(detail.dispose).toHaveBeenCalledOnce();
    expect(loader.has("detail.jpg")).toBe(false);
  });

  it("shares a pending detail and releases it after the last consumer", async () => {
    const pending = deferred<{ dispose: () => void }>();
    const load = vi.fn(() => pending.promise);
    const loader = createDetailResourceLoader(load);
    const first = loader.request("detail.jpg");
    const second = loader.request("detail.jpg");
    const detail = { dispose: vi.fn() };
    pending.resolve(detail);
    await expect(first.promise).resolves.toBe(detail);

    first.release();
    expect(detail.dispose).not.toHaveBeenCalled();
    second.release();
    expect(detail.dispose).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });
});
