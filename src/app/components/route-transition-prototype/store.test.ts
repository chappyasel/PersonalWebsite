import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  ["development", true],
  ["production", false],
] as const)(
  "defaults the prototype to %s: %s without URL parameters",
  async (environment, enabled) => {
    vi.stubEnv("NODE_ENV", environment);
    vi.resetModules();
    const { useRouteTransitionPrototype } = await import("./store");
    expect(useRouteTransitionPrototype.getState()).toMatchObject({
      enabled,
      variant: "origin",
    });
  },
);
