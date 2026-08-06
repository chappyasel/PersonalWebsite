import { describe, expect, it } from "vitest";

import { selectBookNotice } from "./notices";

const FINISHED = { started: "2026-01-01", finished: "2026-01-10" };
const IN_PROGRESS = { started: "2026-08-02", finished: null };
const UNREAD = { started: null, finished: null };

describe("selectBookNotice", () => {
  it("shows the automated notice on a finished, summarized, automated book", () => {
    expect(
      selectBookNotice({ ...FINISHED, isAutomated: true, hasSummary: true }),
    ).toBe("automated");
  });

  it("stays silent when Automated? is ticked but no summary exists yet", () => {
    expect(
      selectBookNotice({ ...FINISHED, isAutomated: true, hasSummary: false }),
    ).toBeNull();
  });

  it("stays silent on a summary Chappy wrote himself", () => {
    expect(
      selectBookNotice({ ...FINISHED, isAutomated: false, hasSummary: true }),
    ).toBeNull();
  });

  it("shows the reading notice while a book is started but not finished", () => {
    expect(
      selectBookNotice({ ...IN_PROGRESS, isAutomated: false, hasSummary: false }),
    ).toBe("reading");
  });

  it("prefers the reading notice over the automated one", () => {
    expect(
      selectBookNotice({ ...IN_PROGRESS, isAutomated: true, hasSummary: true }),
    ).toBe("reading");
  });

  it("stays silent on a book that was never started", () => {
    expect(
      selectBookNotice({ ...UNREAD, isAutomated: false, hasSummary: false }),
    ).toBeNull();
  });

  it("does not treat a finished-only book as in progress", () => {
    expect(
      selectBookNotice({
        started: null,
        finished: "2026-01-10",
        isAutomated: true,
        hasSummary: true,
      }),
    ).toBe("automated");
  });
});
