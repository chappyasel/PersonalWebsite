// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { norms } from "~/lib/personalities/data";
import type { SharedResult } from "~/lib/personalities/sharing";

import SharedResults from "./SharedResults";
import DirectCompare from "./compare/DirectCompare";
import SharedPage from "./shared/SharedPage";

const result: SharedResult = {
  label: "Friend",
  takenOn: "2025-08",
  dateEstimated: true,
  testVersion: "ipip-120",
  scoreKind: "raw",
  scoreMax: 120,
  scores: {
    Openness: 60,
    Conscientiousness: 70,
    Extraversion: 80,
    Agreeableness: 90,
    Neuroticism: 50,
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("personality sharing", () => {
  it("shares the exact two selected assessments in comparison order", () => {
    const onShare = vi.fn();
    render(
      <DirectCompare
        data={{
          norms,
          sources: [],
          people: [
            {
              id: "one",
              name: "One",
              group: "",
              records: [
                {
                  id: "selected-old",
                  label: "Older",
                  source: "",
                  ref: "",
                  scores: result.scores,
                },
                {
                  id: "unselected-new",
                  label: "Newer",
                  source: "",
                  ref: "",
                  scores: result.scores,
                },
              ],
            },
            {
              id: "two",
              name: "Two",
              group: "",
              records: [
                {
                  id: "selected-other",
                  label: "Other",
                  source: "",
                  ref: "",
                  scores: result.scores,
                },
              ],
            },
          ],
        }}
        personId="one"
        onPerson={vi.fn()}
        onAssessment={vi.fn()}
        onShare={onShare}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share comparison" }));
    expect(onShare).toHaveBeenCalledWith(["selected-old", "selected-other"]);
  });

  it("distinguishes repeat names and excludes incompatible scales from curves", () => {
    const html = renderToStaticMarkup(
      <SharedResults
        snapshot={{
          version: 1,
          results: [
            result,
            { ...result, takenOn: "2024-01" },
            {
              ...result,
              label: "Percentile",
              testVersion: "other",
              scoreKind: "percentile",
              scoreMax: 100,
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Friend · Result 1 · August 2025");
    expect(html).toContain("Friend · Result 2 · January 2024");
    expect(html).toContain("Estimated");
    expect(
      html.match(/both results on the reference bell curve/g),
    ).toHaveLength(5);
    expect(html).not.toContain("Share comparison");
    expect(html).not.toContain("Edit date");
    expect(
      renderToStaticMarkup(
        <SharedResults
          snapshot={{
            version: 1,
            results: [{ ...result, scoreKind: "percentage", scoreMax: 100 }],
          }}
        />,
      ),
    ).not.toContain("reference bell curve");
  });

  it("shows unnamed dots for a single result and for comparisons without adding named profiles", () => {
    const anonymous = {
      count: 2,
      scores: {
        Openness: [24, 120],
        Conscientiousness: [60, 60],
        Extraversion: [70, 70],
        Agreeableness: [80, 80],
        Neuroticism: [90, 90],
      },
    };
    const single = renderToStaticMarkup(
      <SharedResults snapshot={{ version: 1, results: [result], anonymous }} />,
    );
    expect(single).toContain("Gray dots: 2 others");
    expect(
      single.match(/shared result on the reference bell curve/g),
    ).toHaveLength(5);
    expect(single.match(/Unnamed person:/g)).toHaveLength(10);
    const singleDocument = new DOMParser().parseFromString(single, "text/html");
    const circles = [...singleDocument.querySelectorAll("circle")];
    expect(
      circles.every((circle) => Number(circle.getAttribute("cy")) > 118),
    ).toBe(true);
    const duplicateTraitDots = [
      ...singleDocument.querySelectorAll("svg"),
    ][1]!.querySelectorAll('circle[fill="#8a9292"]');
    expect(duplicateTraitDots).toHaveLength(2);
    expect(duplicateTraitDots[0]!.getAttribute("cy")).not.toBe(
      duplicateTraitDots[1]!.getAttribute("cy"),
    );
    expect(single).not.toContain("Compare with");
    const pair = renderToStaticMarkup(
      <SharedResults
        snapshot={{
          version: 1,
          results: [result, { ...result, label: "Second" }],
          anonymous,
        }}
      />,
    );
    expect(
      pair.match(/both results on the reference bell curve/g),
    ).toHaveLength(5);
    expect(
      pair.match(/with 2 unnamed people shown as gray dots/g),
    ).toHaveLength(5);
    expect(pair).not.toContain("Unnamed person 1");
    expect(pair).not.toContain("combobox");
    expect(pair).not.toContain("Talk through it");
    expect(pair).not.toContain("How do you differ?");
    expect(pair).toContain("percentile points");
    expect(pair.match(/Est. percentile/g)).toHaveLength(5);
    expect(pair.match(/SD from mean/g)).toHaveLength(5);
    expect(pair).toContain("Biggest gap");
    expect(pair).toContain("Smallest gap");
    expect(pair).not.toContain("Raw scores out of");
    const subset = renderToStaticMarkup(
      <SharedResults
        snapshot={{
          version: 1,
          results: [
            result,
            { ...result, label: "Second" },
            { ...result, label: "Third" },
          ],
        }}
      />,
    );
    expect(subset).toContain("combobox");
  });

  it("loads only the capability endpoint without a library session", async () => {
    const token = "A".repeat(43);
    window.history.replaceState(null, "", `/personalities/shared#${token}`);
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        snapshot: { version: 1, results: [result] },
        expiresAt: null,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<SharedPage />);
    await screen.findByText("Friend");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/personalities/shared",
      expect.objectContaining({
        credentials: "omit",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(screen.queryByText("Unlock")).toBeNull();
  });

  it("shows unavailable links without fetching the library", async () => {
    window.history.replaceState(
      null,
      "",
      `/personalities/shared#${"A".repeat(43)}`,
    );
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Unavailable" }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<SharedPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "This link is unavailable or has expired.",
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Friend")).toBeNull();
  });
});
