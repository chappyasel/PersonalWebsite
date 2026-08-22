import { QueryClient } from "@tanstack/react-query";
import {
  type PersistedClient,
  type Persister,
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("toolchain compatibility", () => {
  it("loads the environment adapter with Zod 4", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");

    const { env } = await import("../src/env.js");

    expect(env).toBeDefined();
  });

  it("round-trips React Query data through the persistence client", async () => {
    let stored: PersistedClient | undefined;
    const persister: Persister = {
      persistClient(client) {
        stored = client;
      },
      restoreClient() {
        return stored;
      },
      removeClient() {
        stored = undefined;
      },
    };
    const source = new QueryClient();
    source.setQueryData(["toolchain-smoke"], { compatible: true });

    await persistQueryClientSave({
      queryClient: source,
      persister,
      buster: "toolchain-smoke",
    });

    const restored = new QueryClient();
    await persistQueryClientRestore({
      queryClient: restored,
      persister,
      buster: "toolchain-smoke",
    });

    expect(restored.getQueryData(["toolchain-smoke"])).toEqual({
      compatible: true,
    });
  });
});
