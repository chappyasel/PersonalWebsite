// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BookPage } from "./BookPage";

const navigation = vi.hoisted(() => ({ push: vi.fn(), transition: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("~/app/components/route-transition-prototype/navigation", () => ({
  requestPrototypeNavigation: navigation.transition,
}));
vi.mock("../components/BookDetailContent", () => ({
  BookDetailContent: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close</button>
  ),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it.each(["click", "Escape"])(
  "requests an animated library return on %s",
  (action) => {
    navigation.transition.mockReturnValue(true);
    render(<BookPage bookId="behave" book={null!} bookshelfBookCount={322} />);
    if (action === "click")
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    else fireEvent.keyDown(window, { key: "Escape" });
    expect(navigation.transition).toHaveBeenCalledWith(".");
    expect(navigation.push).not.toHaveBeenCalled();
  },
);

it("returns to the library when the transition controller is disabled or unavailable", () => {
  navigation.transition.mockReturnValue(false);
  render(<BookPage bookId="behave" book={null!} bookshelfBookCount={322} />);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(navigation.push).toHaveBeenCalledWith(".");
});
