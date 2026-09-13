// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExerciseExplorer } from "./ExerciseExplorer";

const mocks = vi.hoisted(() => ({ chart: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));
vi.mock("../components/BodyweightPareto", () => ({
  BodyweightPareto: (props: { displayName: string; color: string }) => {
    mocks.chart(props);
    return <p>Bodyweight analysis for {props.displayName}</p>;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("exercise Show More analysis", () => {
  it("mounts any exercise's analysis only after Show More and removes it on Show Less", async () => {
    render(
      <ExerciseExplorer
        displayName="Incline Barbell Bench Press"
        instances={[]}
        color="#039BE5"
      />,
    );
    expect(mocks.chart).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Strength at Bodyweight" }),
    ).toBeNull();
    const showMore = screen.getByRole("button", { name: "Show More" });
    expect(showMore.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(showMore);
    expect(
      screen.getByRole("heading", { name: "Strength at Bodyweight" }),
    ).toBeTruthy();
    expect(mocks.chart).toHaveBeenCalledWith({
      displayName: "Incline Barbell Bench Press",
      color: "#039BE5",
    });
    const showLess = screen.getByRole("button", { name: "Show Less" });
    expect(showLess.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(showLess);
    await waitFor(() =>
      expect(screen.queryByText(/Bodyweight analysis for/)).toBeNull(),
    );
  });
});
