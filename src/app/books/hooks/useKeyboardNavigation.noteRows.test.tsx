// @vitest-environment jsdom
import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Book } from "~/lib/books/types";

import { useKeyboardNavigation } from "./useKeyboardNavigation";

const openModal = vi.fn();
vi.mock("../contexts/BookPreviewContext", () => ({
  useModalState: () => ({
    isModalOpen: false,
    keyboardFocusedIndex: 0,
    keyboardFocusedBookId: "behave",
  }),
  useModalActions: () => ({
    setKeyboardFocus: vi.fn(),
    clearKeyboardFocus: vi.fn(),
    openModal,
    closeModal: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=dopamine"),
}));
vi.mock("~/components/modal-sheet/sheetRoute", () => ({
  loadFullPageOnSmallViewport: () => false,
}));

const behave = { id: "behave", title: "Behave" } as Book;

afterEach(() => {
  openModal.mockClear();
  window.history.replaceState(null, "", "/books");
});

describe("useKeyboardNavigation with note rows", () => {
  it("opens a notes match with Enter where its click does", () => {
    renderHook(() =>
      useKeyboardNavigation({
        books: [behave],
        isZoomOut: false,
        noteAnchors: new Map([["behave", "3-the-dopamine-system"]]),
      }),
    );
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(openModal).toHaveBeenCalledWith(behave, "M");
    expect(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    ).toBe("/books/behave?q=dopamine&hl=dopamine#3-the-dopamine-system");
  });

  it("opens a cover with Enter at the top of the book, unmarked", () => {
    renderHook(() =>
      useKeyboardNavigation({ books: [behave], isZoomOut: false }),
    );
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/books/behave?q=dopamine",
    );
    expect(window.location.hash).toBe("");
  });
});
