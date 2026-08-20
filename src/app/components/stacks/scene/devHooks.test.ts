import { describe, expect, it, vi } from "vitest";

import {
  onDevHooksRequested,
  requestDevHooks,
} from "./devHooks";

describe("development hook requests", () => {
  it("replays an existing request to late subscribers and allows reinstalls", () => {
    requestDevHooks();

    const firstInstall = vi.fn();
    const unsubscribeFirst = onDevHooksRequested(firstInstall);

    expect(firstInstall).toHaveBeenCalledTimes(1);
    unsubscribeFirst();

    const remountedInstall = vi.fn();
    const unsubscribeRemounted = onDevHooksRequested(remountedInstall);

    expect(remountedInstall).toHaveBeenCalledTimes(1);

    requestDevHooks();
    expect(firstInstall).toHaveBeenCalledTimes(1);
    expect(remountedInstall).toHaveBeenCalledTimes(2);

    unsubscribeRemounted();
    requestDevHooks();
    expect(remountedInstall).toHaveBeenCalledTimes(2);
  });
});
