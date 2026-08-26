import { describe, expect, it } from "vitest";

import { selectBookNotice } from "./notices";

const FINISHED = {
  started: "2026-01-01",
  finished: "2026-01-10",
  abandoned: null,
};
const IN_PROGRESS = { started: "2026-08-02", finished: null, abandoned: null };
const UNREAD = { started: null, finished: null, abandoned: null };
const ABANDONED = {
  started: "2026-08-21",
  finished: null,
  abandoned: "2026-08-25",
};

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
        abandoned: null,
        isAutomated: true,
        hasSummary: true,
      }),
    ).toBe("automated");
  });

  it("shows the abandoned notice on a dropped book", () => {
    expect(
      selectBookNotice({ ...ABANDONED, isAutomated: false, hasSummary: false }),
    ).toBe("abandoned");
  });

  it("prefers the abandoned notice over the automated one", () => {
    expect(
      selectBookNotice({ ...ABANDONED, isAutomated: true, hasSummary: true }),
    ).toBe("abandoned");
  });

  it("treats a contradictory finished+abandoned book as finished", () => {
    expect(
      selectBookNotice({
        started: "2026-01-01",
        finished: "2026-01-10",
        abandoned: "2026-01-10",
        isAutomated: false,
        hasSummary: false,
      }),
    ).toBeNull();
  });
});
