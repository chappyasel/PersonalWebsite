import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WeightLogPage from "./page";

const mocks = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("~/lib/weight-log/data", () => ({
  getWeightLog: mocks.data,
}));
vi.mock("./WeightLogDashboard", () => ({
  WeightLogDashboard: () => <p>Weight chart</p>,
}));

describe("weight log page", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders the chart without a password or access cookie", async () => {
    mocks.data.mockResolvedValue({});
    expect(renderToStaticMarkup(await WeightLogPage())).toContain(
      "Weight chart",
    );
  });
  it("does not disclose storage errors or source values", async () => {
    mocks.data.mockRejectedValue(new Error("sensitive-fixture-detail"));
    const html = renderToStaticMarkup(await WeightLogPage());
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("sensitive-fixture-detail");
  });
});
