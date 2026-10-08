import { describe, expect, it, vi } from "vitest";

import type { DismissOutcome } from "./native-modal";
import {
  type PasswordRouteDeps,
  CREDENTIAL_ROUTE_BLOCKER,
  PASSWORD_ROUTE_VERIFICATION,
  openPasswordRoute,
} from "./password-route";

function deps(options: {
  dismiss?: DismissOutcome;
  tryAnotherWay?: boolean;
  enterPassword?: boolean;
  passwordField?: boolean;
} = {}): PasswordRouteDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    dismissNativeModal: vi.fn(async (): Promise<DismissOutcome> => {
      calls.push("dismissNativeModal");
      return options.dismiss ?? { kind: "not_present" };
    }),
    clickTryAnotherWay: vi.fn(async () => {
      calls.push("clickTryAnotherWay");
      return options.tryAnotherWay ?? true;
    }),
    chooseEnterPassword: vi.fn(async () => {
      calls.push("chooseEnterPassword");
      return options.enterPassword ?? true;
    }),
    passwordFieldVisible: vi.fn(async () => {
      calls.push("passwordFieldVisible");
      return options.passwordField ?? true;
    }),
  };
}

describe("openPasswordRoute", () => {
  it("clears the native modal before it touches the page, then stops at the field", async () => {
    const d = deps({ dismiss: { kind: "dismissed", windowId: 11 } });
    await expect(openPasswordRoute(d)).resolves.toEqual({
      kind: "password_prompt_ready",
      credentialRoute: "operator_vault_required",
      blocker: CREDENTIAL_ROUTE_BLOCKER,
    });
    expect(d.calls).toEqual([
      "dismissNativeModal",
      "clickTryAnotherWay",
      "chooseEnterPassword",
      "passwordFieldVisible",
    ]);
  });

  it("goes straight to the page when no modal is in the way", async () => {
    const d = deps({ dismiss: { kind: "not_present" } });
    await expect(openPasswordRoute(d)).resolves.toMatchObject({
      kind: "password_prompt_ready",
    });
  });

  it.each([
    ["dismiss_unconfirmed", { kind: "dismiss_unconfirmed" }],
    ["ambiguous_native_evidence", { kind: "ambiguous_native_evidence" }],
    ["foreign_modal", { kind: "foreign_modal" }],
    ["dismiss_control_missing", { kind: "dismiss_control_missing" }],
    ["driver_error", { kind: "driver_error" }],
    ["browser_gone", { kind: "browser_gone" }],
  ] as [string, DismissOutcome][])(
    "refuses to click Try another way after %s",
    async (_label, dismiss) => {
      const d = deps({ dismiss });
      await expect(openPasswordRoute(d)).resolves.toEqual({
        kind: "blocked",
        reason: "native_modal_present",
      });
      expect(d.calls).toEqual(["dismissNativeModal"]);
      expect(d.clickTryAnotherWay).not.toHaveBeenCalled();
    },
  );

  it("blocks on the disabled adapter instead of pressing on without it", async () => {
    const d = deps({ dismiss: { kind: "driver_disabled" } });
    await expect(openPasswordRoute(d)).resolves.toEqual({
      kind: "blocked",
      reason: "native_modal_driver_unavailable",
    });
    expect(d.calls).toEqual(["dismissNativeModal"]);
  });

  it.each([
    ["try_another_way", { tryAnotherWay: false }, ["clickTryAnotherWay"]],
    [
      "enter_password",
      { enterPassword: false },
      ["clickTryAnotherWay", "chooseEnterPassword"],
    ],
    [
      "password_field",
      { passwordField: false },
      ["clickTryAnotherWay", "chooseEnterPassword", "passwordFieldVisible"],
    ],
  ] as [string, Parameters<typeof deps>[0], string[]][])(
    "reports a missing %s step as a failure, not as a password prompt",
    async (step, options, expectedCalls) => {
      const d = deps(options);
      await expect(openPasswordRoute(d)).resolves.toEqual({
        kind: "failed",
        error: "password_route_failed",
        step,
      });
      expect(d.calls).toEqual(["dismissNativeModal", ...expectedCalls]);
    },
  );

  it("has no capability for entering a credential at all", () => {
    expect(Object.keys(deps()).filter((key) => key !== "calls").sort()).toEqual([
      "chooseEnterPassword",
      "clickTryAnotherWay",
      "dismissNativeModal",
      "passwordFieldVisible",
    ]);
  });

  it("reaching the password field is not a claim that Google authenticated", () => {
    expect(PASSWORD_ROUTE_VERIFICATION).toEqual({
      adapterDecisions: "covered_by_fixtures",
      liveGoogleAuth: "unverified",
    });
  });
});
