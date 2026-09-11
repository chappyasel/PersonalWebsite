// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ModalSheetDismissContext } from "./ModalSheet";
import SheetReturnLink from "./SheetReturnLink";

afterEach(cleanup);

it("leaves a standalone document's return link available to normal page navigation", () => {
  render(
    <SheetReturnLink href="https://www.chappyasel.com">Return</SheetReturnLink>,
  );
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "https://www.chappyasel.com",
  );
  expect(screen.getByRole("link").hasAttribute("data-route-transition")).toBe(
    false,
  );
});

it("lets the sheet own ordinary returns while preserving modified clicks", () => {
  const dismiss = vi.fn();
  render(
    <ModalSheetDismissContext.Provider value={dismiss}>
      <SheetReturnLink href="#room">Return</SheetReturnLink>
    </ModalSheetDismissContext.Provider>,
  );
  const link = screen.getByRole("link");
  expect(link.getAttribute("data-route-transition")).toBe("preserve");
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    fireEvent.click(link, { [modifier]: true });
  }
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(dismiss).toHaveBeenCalledTimes(1);
});
