import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";

import { failure, isConflict } from "./refusal";

const error = (message: string, data: Record<string, unknown>) =>
  new TRPCClientError(message, { result: { error: { data } } } as never);

describe("failure", () => {
  it("shows the server's own refusal", () => {
    expect(
      failure(
        error("The week of Feb 4, 2030 has no target.", {
          code: "BAD_REQUEST",
        }),
        "Fallback.",
      ),
    ).toBe("The week of Feb 4, 2030 has no target.");
  });

  it("hides a validation dump and anything unexpected", () => {
    expect(
      failure(
        error('[{"code":"too_big"}]', {
          code: "BAD_REQUEST",
          zodError: { fieldErrors: {} },
        }),
        "Fallback.",
      ),
    ).toBe("Fallback.");
    expect(
      failure(error("boom", { code: "INTERNAL_SERVER_ERROR" }), "Fallback."),
    ).toBe("Fallback.");
    expect(failure(new Error("offline"), "Fallback.")).toBe("Fallback.");
  });
});

describe("isConflict", () => {
  it("is a stale page", () => {
    expect(isConflict(error("Stale.", { code: "CONFLICT" }))).toBe(true);
    expect(isConflict(error("No.", { code: "BAD_REQUEST" }))).toBe(false);
  });
});
