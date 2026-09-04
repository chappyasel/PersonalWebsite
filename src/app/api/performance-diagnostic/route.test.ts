import { createPerformanceDiagnosticEvent } from "../../components/stacks/performanceDiagnostic";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function diagnosticEvent() {
  return createPerformanceDiagnosticEvent({
    diagnosticRunId: "test-run.1",
    reportKind: "boot_checkpoint",
    captureReason: "slow_boot_checkpoint",
    checkpointIndex: 1,
    elapsedMs: 10_000,
    bootStatus: "booting",
    bootPath: "cold",
    blockingGate: "meadow",
    report: { boot: { blocking_gate: "meadow" } },
  });
}

function request(
  body: string,
  origin = "https://www.chappyasel.com",
  schema = "4",
) {
  return new Request("https://www.chappyasel.com/api/performance-diagnostic", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-stacks-diagnostic": schema,
    },
    body,
  });
}

describe("performance diagnostic relay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards a validated report anonymously and acknowledges the report id", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    const upstream = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json({ status: "Ok" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", upstream);
    const event = diagnosticEvent();

    const response = await POST(request(JSON.stringify(event)));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      report_id: event.diagnostic_report_id,
    });
    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0]?.[0]).toBe(
      "https://us.i.posthog.com/i/v0/e/",
    );
    const options = upstream.mock.calls[0]![1]!;
    expect(typeof options.body).toBe("string");
    const forwarded = JSON.parse(options.body as string) as Record<
      string,
      unknown
    >;
    expect(forwarded).toMatchObject({
      api_key: "phc_test",
      event: "homepage_performance_diagnostic",
      distinct_id: "test-run.1",
      properties: {
        diagnostic_report_id: event.diagnostic_report_id,
        $process_person_profile: false,
        $lib: "stacks-diagnostic-relay",
      },
    });
  });

  it("rejects cross-origin and malformed submissions before PostHog", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const crossOrigin = await POST(
      request(JSON.stringify(diagnosticEvent()), "https://example.com"),
    );
    const malformed = await POST(request(JSON.stringify({ hello: "world" })));

    expect(crossOrigin.status).toBe(403);
    expect(malformed.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("accepts runtime checkpoints and rejects stale or incomplete schema payloads", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    const upstream = vi.fn(async () =>
      Response.json({ status: "Ok" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", upstream);
    const checkpoint = createPerformanceDiagnosticEvent({
      diagnosticRunId: "test-run.checkpoint",
      reportKind: "runtime_checkpoint",
      captureReason: "post_reveal_checkpoint",
      checkpointIndex: 1,
      elapsedMs: 12_000,
      bootStatus: "live",
      bootPath: "warm",
      blockingGate: null,
      postRevealObservedMs: 5_000,
      pagehidePersisted: true,
      report: { runtime_capture: { pagehide_persisted: true } },
    });

    const accepted = await POST(request(JSON.stringify(checkpoint)));
    const staleHeader = await POST(
      request(JSON.stringify(checkpoint), undefined, "3"),
    );
    const incomplete: Partial<typeof checkpoint> = { ...checkpoint };
    delete incomplete.pagehide_persisted;
    const incompleteBody = await POST(request(JSON.stringify(incomplete)));

    expect(accepted.status).toBe(202);
    expect(staleHeader.status).toBe(403);
    expect(incompleteBody.status).toBe(400);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("returns a retryable failure when PostHog does not accept the event", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 503 })),
    );

    const response = await POST(request(JSON.stringify(diagnosticEvent())));

    expect(response.status).toBe(502);
  });
});
