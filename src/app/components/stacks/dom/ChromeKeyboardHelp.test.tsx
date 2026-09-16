// @vitest-environment jsdom
import { homeTapMotion } from "../scene/homeTapMotion";
import { useStacks } from "../store";
import * as Dialog from "@radix-ui/react-dialog";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPEN_UNIVERSAL_SEARCH_EVENT,
  UniversalSearchController,
  type UniversalSearchPaletteProps,
} from "~/components/universal-search/UniversalSearchController";

import ChromeKeyboardHelp from "./ChromeKeyboardHelp";

function SearchDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: UniversalSearchPaletteProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseAutoFocus?.();
          }}
        >
          <Dialog.Title>Search</Dialog.Title>
          <input aria-label="Search query" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const playHomeFeedback = vi.fn();
beforeEach(() => {
  playHomeFeedback.mockClear();
  vi.spyOn(homeTapMotion, "play").mockImplementation(playHomeFeedback);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useStacks.setState(useStacks.getInitialState());
  window.history.replaceState(null, "", "/");
});

describe("ChromeKeyboardHelp", () => {
  it.each([false, true])(
    "opens search after the name and Field Notes, tap-first: %s",
    (tapFirst) => {
      const dispatch = vi.spyOn(window, "dispatchEvent");
      const onOpen = vi.fn();
      render(
        <ChromeKeyboardHelp
          open={false}
          onOpenChange={onOpen}
          tapFirst={tapFirst}
          fieldNotes={<button type="button">Field Notes</button>}
        />,
      );
      const search = screen.getByRole("button", { name: "Search the site" });
      const notes = screen.getByRole("button", { name: "Field Notes" });
      const name = screen.getByText("Chappy Asel");
      expect(
        name.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        notes.compareDocumentPosition(search) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      fireEvent.click(search);
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: OPEN_UNIVERSAL_SEARCH_EVENT }),
      );
      expect(onOpen).not.toHaveBeenCalled();
    },
  );

  it.each(["click", "shortcut"])(
    "keeps the tooltip closed after search opened by %s restores focus",
    async (opening) => {
      const user = userEvent.setup();
      render(
        <>
          <ChromeKeyboardHelp
            open={false}
            onOpenChange={vi.fn()}
            tapFirst={false}
            fieldNotes={null}
          />
          <UniversalSearchController
            loadPalette={async () => ({ UniversalSearchPalette: SearchDialog })}
            schedulePreload={() => () => undefined}
          />
        </>,
      );
      const search = screen.getByRole("button", { name: "Search the site" });
      if (opening === "click") await user.click(search);
      else {
        search.focus();
        await user.keyboard("{Control>}k{/Control}");
      }
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(document.activeElement).toBe(search));
      expect(screen.queryByRole("tooltip")).toBeNull();

      // A later, deliberate keyboard visit should still describe the button.
      await user.tab();
      await user.tab({ shift: true });
      await waitFor(() => expect(screen.getByRole("tooltip")).toBeTruthy());
    },
  );

  it.each([true, false])("returns home on click, tap-first: %s", (tapFirst) => {
    const onOpen = vi.fn();
    useStacks.setState({ activeUnit: 3, sheetDismissed: true });
    render(
      <ChromeKeyboardHelp
        open={false}
        onOpenChange={onOpen}
        tapFirst={tapFirst}
        fieldNotes={<button type="button">Field Notes</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Chappy Asel, return home" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open keyboard shortcuts" }),
    ).toBeNull();
    expect(screen.queryByText("Shortcuts")).toBeNull();
    fireEvent.click(screen.getByText("Chappy Asel"));
    expect(useStacks.getState().activeUnit).toBe(0);
    expect(useStacks.getState().sheetDismissed).toBe(false);
    expect(playHomeFeedback).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Field Notes" })).toBeTruthy();
  });

  it("closes an expanded About sheet without adding another home history entry", () => {
    window.history.replaceState(null, "", "/");
    useStacks.setState({ activeUnit: 0, panelState: "open" });
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const push = vi.spyOn(window.history, "pushState");
    render(
      <ChromeKeyboardHelp
        open={false}
        onOpenChange={vi.fn()}
        tapFirst
        fieldNotes={null}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Chappy Asel, return home" }),
    );
    expect(back).toHaveBeenCalledOnce();
    expect(useStacks.getState().panelState).toBe("closing");
    act(() => useStacks.setState({ panelState: "closed" }));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Chappy Asel, return home" }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(playHomeFeedback).toHaveBeenCalledTimes(2);
  });

  it("shows shortcuts in the name tooltip without a help overlay", () => {
    render(
      <ChromeKeyboardHelp
        open
        onOpenChange={vi.fn()}
        tapFirst={false}
        fieldNotes={null}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Chappy Asel, return home",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Shortcuts")).toBeNull();
    expect(screen.getAllByText("Hide or show details").length).toBeGreaterThan(
      0,
    );
  });
});
