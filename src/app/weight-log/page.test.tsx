import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WeightLogPage from "./page";

const mocks = vi.hoisted(() => ({ access: vi.fn(), data: vi.fn() }));
vi.mock("~/lib/weight-log/data", () => ({
  hasWeightLogAccess: mocks.access,
  getWeightLog: mocks.data,
}));
vi.mock("./PasswordGate", () => ({
  WeightLogPasswordGate: () => <p>Password gate</p>,
}));
vi.mock("./WeightLogDashboard", () => ({
  WeightLogDashboard: () => <p>Private chart</p>,
}));

describe("weight log page", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not load or serialize history into the password gate", async () => {
    mocks.access.mockResolvedValue(false);
    expect(renderToStaticMarkup(await WeightLogPage())).toContain(
      "Password gate",
    );
    expect(mocks.data).not.toHaveBeenCalled();
  });
  it("renders the chart after authorization", async () => {
    mocks.access.mockResolvedValue(true);
    mocks.data.mockResolvedValue({});
    expect(renderToStaticMarkup(await WeightLogPage())).toContain(
      "Private chart",
    );
  });
  it("does not disclose storage errors or source values", async () => {
    mocks.access.mockResolvedValue(true);
    mocks.data.mockRejectedValue(new Error("sensitive-fixture-detail"));
    const html = renderToStaticMarkup(await WeightLogPage());
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("sensitive-fixture-detail");
  });
});
