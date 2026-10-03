import { describe, expect, it } from "vitest";

import {
  buildErrorReport,
  collapsePrivatePath,
  errorArea,
  isPrivateArea,
  isReportableRequestFailure,
  procedureFromKey,
  sanitizeError,
  scrubErrorMessage,
} from "./sanitize";

const BROWSER = { runtime: "browser", environment: "test" } as const;

function trpcError(code: string, httpStatus: number, message = "failed") {
  return Object.assign(new Error(message), {
    name: "TRPCClientError",
    data: { code, httpStatus, path: "books.getById" },
  });
}

describe("private areas", () => {
  it("names the area of a path, an API route, and a procedure", () => {
    expect(errorArea("/books/the-hobbit")).toBe("books");
    expect(errorArea("/api/cron/sync-books")).toBe("cron");
    expect(errorArea("/api/dad-images/2003/a.jpg")).toBe("dad-images");
    expect(errorArea("youtube.getStats")).toBe("youtube");
    expect(errorArea("/")).toBe("home");
    expect(errorArea(undefined)).toBeNull();
  });

  it("treats Dad and YouTube, and their API routes, as private", () => {
    expect(isPrivateArea("dad")).toBe(true);
    expect(isPrivateArea("dad-images")).toBe(true);
    expect(isPrivateArea("youtube")).toBe(true);
    expect(isPrivateArea("books")).toBe(false);
    expect(isPrivateArea("daddy")).toBe(false);
  });

  it("cuts a private path back to the area root", () => {
    expect(collapsePrivatePath("/dad/journal/2003/some-entry")).toBe("/dad");
    expect(collapsePrivatePath("/youtube/calibrate")).toBe("/youtube");
    expect(collapsePrivatePath("/api/dad-images/2003/a.jpg")).toBe(
      "/api/dad-images",
    );
    expect(collapsePrivatePath("/books/the-hobbit")).toBe("/books/the-hobbit");
  });
});

describe("scrubErrorMessage", () => {
  it("keeps Drizzle's SQL and drops its bound values", () => {
    expect(
      scrubErrorMessage(
        'Failed query: select "id" from "books" where "title" ilike $1\nparams: %private search%',
      ),
    ).toBe(
      'Failed query: select "id" from "books" where "title" ilike $1\nparams: [redacted]',
    );
  });

  it("drops bound values whatever reports them", () => {
    expect(scrubErrorMessage("insert failed\nparams: secret, 42")).toBe(
      "insert failed\nparams: [redacted]",
    );
  });

  it("drops quoted values from other messages", () => {
    expect(
      scrubErrorMessage('invalid input syntax for type uuid: "my secret"'),
    ).toBe('invalid input syntax for type uuid: "[redacted]"');
    expect(
      scrubErrorMessage(
        "Cannot read properties of undefined (reading 'title')",
      ),
    ).toBe("Cannot read properties of undefined (reading 'title')");
  });

  it("drops URL queries, credentials, emails, and tokens", () => {
    expect(
      scrubErrorMessage(
        "fetch https://covers.example.com/a.jpg?X-Amz-Signature=abc failed",
      ),
    ).toBe("fetch https://covers.example.com/a.jpg failed");
    expect(
      scrubErrorMessage("connect postgresql://user:hunter2@db.host:5432/app"),
    ).toBe("connect postgresql://db.host:5432/app");
    expect(scrubErrorMessage("no user for chappy@example.com")).toBe(
      "no user for [email]",
    );
    expect(scrubErrorMessage("Authorization: Bearer abc.def")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(
      scrubErrorMessage("key 0123456789abcdef0123456789abcdef rejected"),
    ).toBe("key [token] rejected");
  });

  it("caps the length", () => {
    expect(scrubErrorMessage("x ".repeat(400))).toHaveLength(501);
  });
});

describe("sanitizeError", () => {
  it("removes a redacted message from the stack header too", () => {
    const error = new TypeError("entry Some Entry\nhas no body");
    const clean = sanitizeError(error, true);
    expect(clean.name).toBe("TypeError");
    expect(clean.message).toBe("[redacted]");
    expect(clean.stack).not.toContain("Some Entry");
    expect(clean.stack?.split("\n")[0]).toBe("TypeError: [redacted]");
    expect(clean.stack?.split("\n").slice(1).length).toBeGreaterThan(0);
  });

  it("keeps Firefox and Safari frames, which have no header", () => {
    const error = new Error("boom");
    error.stack =
      "render@https://www.chappyasel.com/_next/static/chunks/page.js:1:200\n@https://www.chappyasel.com/_next/static/chunks/main.js:2:10";
    expect(sanitizeError(error, false).stack).toBe(
      "Error: boom\nrender@https://www.chappyasel.com/_next/static/chunks/page.js:1:200\n@https://www.chappyasel.com/_next/static/chunks/main.js:2:10",
    );
  });

  it("sanitizes the cause chain", () => {
    const root = new Error('relation "journal" leaked "secret"');
    const error = new Error("Failed query: select 1\nparams: secret", {
      cause: root,
    });
    const clean = sanitizeError(error, false);
    expect(clean.message).toBe("Failed query: select 1\nparams: [redacted]");
    expect((clean.cause as Error).message).toBe(
      'relation "[redacted]" leaked "[redacted]"',
    );
  });

  it("handles thrown values that are not errors", () => {
    const clean = sanitizeError({ entry: "private" }, true);
    expect(clean.name).toBe("NonErrorThrown");
    expect(clean.message).toBe("[redacted]");
  });
});

describe("buildErrorReport", () => {
  it("drops the message and the path in the private areas", () => {
    const report = buildErrorReport(
      new Error("Video Some Title failed"),
      { source: "query", procedure: "youtube.getStats" },
      BROWSER,
    );
    expect(report.error.message).toBe("[redacted]");
    expect(report.properties).toMatchObject({
      error_private: true,
      error_area: "youtube",
      trpc_procedure: "youtube.getStats",
    });

    const fromPath = buildErrorReport(
      new Error("Entry Some Entry failed"),
      { source: "boundary", route: "/dad/journal/2003/some-entry" },
      BROWSER,
    );
    expect(fromPath.error.message).toBe("[redacted]");
    expect(fromPath.properties.error_route).toBe("/dad");
  });

  it("keeps a scrubbed message elsewhere", () => {
    const report = buildErrorReport(
      new Error("connection refused"),
      {
        source: "trpc",
        procedure: "books.getById",
        code: "INTERNAL_SERVER_ERROR",
        fingerprint: "query:books.getById:INTERNAL_SERVER_ERROR",
        issueName: "books.getById query failed",
      },
      { runtime: "server", environment: "production" },
    );
    expect(report.error.message).toBe("connection refused");
    expect(report.properties).toEqual({
      error_source: "trpc",
      error_runtime: "server",
      error_private: false,
      environment: "production",
      error_area: "books",
      trpc_procedure: "books.getById",
      trpc_code: "INTERNAL_SERVER_ERROR",
      $exception_fingerprint: "query:books.getById:INTERNAL_SERVER_ERROR",
      $issue_name: "books.getById query failed",
    });
  });

  it("redacts on request outside the private areas", () => {
    const report = buildErrorReport(
      new Error("token abc rejected"),
      { source: "cron", route: "/api/cron/sync-book-emojis", redactMessage: true },
      BROWSER,
    );
    expect(report.error.message).toBe("[redacted]");
    expect(report.properties.error_private).toBe(false);
  });

  it("gives repeats of one failure the same key", () => {
    const context = { source: "query", procedure: "books.getAll" } as const;
    expect(buildErrorReport(new Error("a"), context, BROWSER).key).toBe(
      buildErrorReport(new Error("a"), context, BROWSER).key,
    );
    expect(buildErrorReport(new Error("a"), context, BROWSER).key).not.toBe(
      buildErrorReport(new Error("b"), context, BROWSER).key,
    );
  });
});

describe("client request failures", () => {
  it("reads the procedure from a tRPC key and never the input", () => {
    expect(
      procedureFromKey([
        ["books", "searchNotes"],
        { input: { query: "private" }, type: "query" },
      ]),
    ).toBe("books.searchNotes");
    expect(procedureFromKey(undefined)).toBeUndefined();
    expect(procedureFromKey(["not-trpc"])).toBeUndefined();
  });

  it("reports server faults and missing responses, not 4xx or offline", () => {
    expect(
      isReportableRequestFailure(
        trpcError("INTERNAL_SERVER_ERROR", 500),
        true,
      ),
    ).toBe(true);
    expect(
      isReportableRequestFailure(new TypeError("Failed to fetch"), true),
    ).toBe(true);
    expect(
      isReportableRequestFailure(trpcError("UNAUTHORIZED", 401), true),
    ).toBe(false);
    expect(isReportableRequestFailure(trpcError("NOT_FOUND", 404), true)).toBe(
      false,
    );
    expect(
      isReportableRequestFailure(new TypeError("Failed to fetch"), false),
    ).toBe(false);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isReportableRequestFailure(abort, true)).toBe(false);
  });
});
