// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TAP_FIRST_POINTER_QUERY } from "~/lib/useTapFirstCapability";

import { Keycap } from "./keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

function usePointerProfile(tapFirst: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === TAP_FIRST_POINTER_QUERY ? tapFirst : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function ShortcutTooltip() {
  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <button type="button">Scene control</button>
        </TooltipTrigger>
        <TooltipContent>
          Scene help <Keycap>K</Keycap>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tap-first tooltip policy", () => {
  it("does not render tooltip or keycap content on coarse no-hover pointers", () => {
    usePointerProfile(true);

    render(<ShortcutTooltip />);

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByText("Scene help")).toBeNull();
    expect(document.querySelector("kbd")).toBeNull();
  });

  it("preserves tooltip and keycap content for desktop pointers", () => {
    usePointerProfile(false);

    render(<ShortcutTooltip />);

    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.getAllByText(/Scene help/).length).toBeGreaterThan(0);
    expect(document.querySelector("kbd")?.textContent).toBe("K");
  });
});
