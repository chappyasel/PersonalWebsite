// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SiteLink from "~/components/site/SiteLink";

import SheetLayout from "~/app/@sheet/layout";

const { navigation, scenePresence, takeOrigin, routerBack } = vi.hoisted(
  () => ({
    navigation: {
      segment: "(.)systems",
      replace: undefined as boolean | undefined,
    },
    scenePresence: vi.fn(),
    takeOrigin: vi.fn(() => ({ l: 10, t: 20, w: 100, h: 100 })),
    routerBack: vi.fn(() => window.history.back()),
  }),
);
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: () => navigation.segment,
  useRouter: () => ({ back: routerBack }),
}));
vi.mock("next/link", () => ({
  default: ({
    replace,
    onNavigate,
    ...props
  }: ComponentProps<"a"> & {
    replace?: boolean;
    onNavigate?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        let prevented = false;
        onNavigate?.({
          preventDefault: () => {
            prevented = true;
          },
        });
        if (prevented) return;
        navigation.replace = replace;
        window.history[replace ? "replaceState" : "pushState"](
          null,
          "",
          props.href,
        );
      }}
    />
  ),
}));
vi.mock("~/components/site/SitePageHoverCard", () => ({
  default: ({ children }: { children: ReactNode }) => children,
  SITE_PAGE_GLYPH: {
    manual: { Icon: () => null, accent: "plum" },
    routine: { Icon: () => null, accent: "am" },
    systems: { Icon: () => null, accent: "indigo" },
  },
}));
vi.mock("~/app/components/stacks/store", () => ({
  useStacks: { getState: () => ({ setModalOpen: scenePresence }) },
}));
vi.mock("~/lib/originFlight", () => ({
  takeModalOrigin: takeOrigin,
  originEntrance: vi.fn(),
  originExit: vi.fn(() => false),
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.segment = "(.)systems";
  navigation.replace = undefined;
  window.history.replaceState(null, "", "/#systems");
  window.history.pushState(null, "", "/systems");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("document navigation inside a sheet", () => {
  it("reuses the shell and launch origin, then closes directly to the scene", async () => {
    const view = render(
      <SheetLayout>
        <SiteLink
          href="https://manual.chappyasel.com/?section=work#communication"
          page="manual"
        >
          Manual
        </SiteLink>
      </SheetLayout>,
    );
    const shell = screen.getByRole("dialog");
    await waitFor(() => expect(scenePresence).toHaveBeenCalledWith(true));
    const link = screen.getByRole("link", { name: "Manual" });
    expect(link.getAttribute("href")).toBe(
      "/manual?section=work#communication",
    );
    expect(link.getAttribute("data-route-transition")).toBe("preserve");
    fireEvent.click(link);
    expect(navigation.replace).toBe(true);
    navigation.segment = "(.)manual";
    view.rerender(
      <SheetLayout>
        <p>Manual content</p>
      </SheetLayout>,
    );
    expect(screen.getByRole("dialog")).toBe(shell);
    expect(takeOrigin).toHaveBeenCalledTimes(1);
    expect(scenePresence).not.toHaveBeenCalledWith(false);
    expect(
      screen.getByRole("link", { name: "Open full page" }).getAttribute("href"),
    ).toBe("/manual");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(routerBack).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(window.location.pathname + window.location.hash).toBe("/#systems"),
    );
  });

  it("pushes the first document navigation when reading a full page", () => {
    render(
      <SiteLink href="/manual" page="manual">
        Manual
      </SiteLink>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(navigation.replace).not.toBe(true);
  });

  it("preserves cross-host document URLs outside a sheet", () => {
    render(
      <SiteLink href="https://routine.chappyasel.com" page="routine">
        Routine
      </SiteLink>,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://routine.chappyasel.com",
    );
  });

  it("renders no sheet for an inactive slot", () => {
    navigation.segment = "__DEFAULT__";
    render(<SheetLayout>{null}</SheetLayout>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
