/**
 * Getting from Google's passkey prompt to its password prompt — and stopping
 * there.
 *
 * The native "No passkeys available" window has to be out of the way before the
 * DOM's "Try another way" can be clicked at all; that is the bug this route
 * exists to fix. Once the password field is on screen the route is finished.
 * There is deliberately no dependency here that could type a password, and
 * nothing else in this pipeline types one either: the person at the window
 * does.
 *
 * Reaching the password field is not authentication. Nothing in this module or
 * its tests has been run against Google — see PASSWORD_ROUTE_VERIFICATION.
 */
import type { DismissOutcome } from "./native-modal";
import type { RequestBlocker, RequestFailure } from "./request-state";

/** Recorded on the request when the route parks at the password prompt. */
export const CREDENTIAL_ROUTE_BLOCKER: RequestBlocker =
  "credential_route_unavailable";

/** What the fixtures prove, and what they do not. */
export const PASSWORD_ROUTE_VERIFICATION = {
  adapterDecisions: "covered_by_fixtures",
  liveGoogleAuth: "unverified",
} as const;

export type PasswordRouteDeps = {
  /** Owned-browser-bound native dismissal. Runs before anything touches the DOM. */
  dismissNativeModal: () => Promise<DismissOutcome>;
  clickTryAnotherWay: () => Promise<boolean>;
  chooseEnterPassword: () => Promise<boolean>;
  passwordFieldVisible: () => Promise<boolean>;
};

export type PasswordRouteResult =
  | {
      kind: "password_prompt_ready";
      credentialRoute: "operator_vault_required";
      blocker: RequestBlocker;
    }
  | { kind: "blocked"; reason: RequestBlocker }
  | {
      kind: "failed";
      error: RequestFailure;
      step: "try_another_way" | "enter_password" | "password_field";
    };

export async function openPasswordRoute(
  deps: PasswordRouteDeps,
): Promise<PasswordRouteResult> {
  const dismissal = await deps.dismissNativeModal();
  if (dismissal.kind === "driver_disabled") {
    return { kind: "blocked", reason: "native_modal_driver_unavailable" };
  }
  if (dismissal.kind !== "not_present" && dismissal.kind !== "dismissed") {
    // Unconfirmed, ambiguous, foreign, or errored. The window may still be
    // swallowing clicks, and clicking anyway is what used to hang on "Loading".
    return { kind: "blocked", reason: "native_modal_present" };
  }

  if (!(await deps.clickTryAnotherWay())) {
    return {
      kind: "failed",
      error: "password_route_failed",
      step: "try_another_way",
    };
  }
  if (!(await deps.chooseEnterPassword())) {
    return {
      kind: "failed",
      error: "password_route_failed",
      step: "enter_password",
    };
  }
  if (!(await deps.passwordFieldVisible())) {
    return {
      kind: "failed",
      error: "password_route_failed",
      step: "password_field",
    };
  }

  return {
    kind: "password_prompt_ready",
    credentialRoute: "operator_vault_required",
    blocker: CREDENTIAL_ROUTE_BLOCKER,
  };
}
