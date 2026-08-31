// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AboutIntro } from "./About";
import { useStacks } from "./stacks/store";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

describe("About bio section links", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    useStacks.setState({
      activeUnit: 0,
      modalOpen: false,
      panelState: "closed",
      travelTo: null,
    });
  });

  it("moves the active Stacks scene when a related section is clicked", () => {
    const travelTo = vi.fn();
    useStacks.getState().setTravelTo(travelTo);
    render(<AboutIntro />);

    fireEvent.click(screen.getByRole("link", { name: "speak" }));

    expect(window.location.hash).toBe("#talks");
    expect(travelTo).toHaveBeenCalledWith(6);
  });
});
