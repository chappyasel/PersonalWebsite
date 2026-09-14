// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import * as originFlight from "~/lib/originFlight";

import { Modal } from "./Modal";

const { entrance, closeModal, exit } = vi.hoisted(() => ({
  entrance: vi.fn((shell: HTMLElement) => shell.style.transform),
  closeModal: vi.fn(),
  exit: vi.fn(
    (
      _shell: HTMLElement,
      _origin: unknown,
      _backdrop: HTMLElement | null,
      _finish: () => void,
    ) => false,
  ),
}));
vi.mock("~/lib/originFlight", async (importOriginal) => ({
  ...(await importOriginal<typeof originFlight>()),
  originEntrance: entrance,
  originExit: exit,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/books/test-book",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../hooks/useBookPath", () => ({
  useBookPath: () => (id: string) => `/books/${id}`,
}));
vi.mock("../contexts/BookPreviewContext", () => ({
  useModalState: () => ({
    isModalOpen: true,
    selectedBookId: "test-book",
    selectedBook: { id: "test-book", title: "Test book", hasNotes: true },
  }),
  useModalActions: () => ({ closeModal, openModalById: vi.fn() }),
}));
vi.mock("~/trpc/react", () => ({
  api: { books: { getById: { useQuery: () => ({ isLoading: true }) } } },
}));
vi.mock("./BookDetailContent", () => ({
  BookDetailContent: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close book</button>
  ),
}));
vi.mock("./ModalHost", () => ({
  fullBookPageHref: (id: string) => `/books/${id}`,
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(window.history, "back").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  exit.mockReset();
  exit.mockReturnValue(false);
});

it.each(["close button", "history back"])(
  "starts returning chrome before the exit flight finishes via %s",
  (method) => {
    originFlight.recordModalOrigin({
      left: 1100,
      top: 300,
      width: 64,
      height: 96,
    });
    const returning = vi.fn();
    let finish!: () => void;
    exit.mockImplementation((_shell, _origin, _backdrop, onFinish) => {
      expect(returning).toHaveBeenCalledOnce();
      expect(document.documentElement.hasAttribute("data-overlay-open")).toBe(
        false,
      );
      finish = onFinish;
      return true;
    });
    render(
      <Modal
        presentation={{
          source: "stacks",
          booksHref: "/books",
          onCloseStart: returning,
        }}
      />,
    );
    if (method === "history back") {
      window.history.replaceState(null, "", "/");
      fireEvent.popState(window, { state: null });
    } else fireEvent.click(screen.getByRole("button", { name: "Close book" }));
    expect(exit).toHaveBeenCalledOnce();
    expect(closeModal).not.toHaveBeenCalled();
    finish();
    expect(closeModal).toHaveBeenCalledOnce();
  },
);

it("measures the resting shell before flying from a desktop cover", () => {
  originFlight.recordModalOrigin({
    left: 1100,
    top: 300,
    width: 64,
    height: 96,
  });
  render(<Modal presentation={{ source: "stacks", booksHref: "/books" }} />);
  expect(entrance).toHaveBeenCalledTimes(1);
  expect(entrance.mock.results[0]?.value).toBe("none");
  fireEvent.click(screen.getByRole("button", { name: "Close book" }));
  expect(closeModal).toHaveBeenCalledOnce();
});
