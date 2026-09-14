// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { VariationPicker } from "./VariationPicker";

vi.mock("~/components/modal-sheet/ModalSheet", async () => ({
  InModalSheetContext: (await import("react")).createContext(true),
}));
vi.mock("next/link", () => ({
  default: ({
    replace,
    ...props
  }: React.ComponentProps<"a"> & { replace?: boolean }) => (
    <a {...props} data-replace={replace} />
  ),
}));
afterEach(cleanup);
it("offers all variants separately from the default variant and replaces the sheet route", () => {
  render(
    <VariationPicker
      title="Bench Press"
      baseName="Bench Press"
      color="#039BE5"
      currentSlug="all~bench"
      allVariantsSlug="all~bench"
      variants={[
        { slug: "bench-press", displayName: "Bench Press" },
        { slug: "incline-bench-press", displayName: "Incline Bench Press" },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Bench Press" }));
  const all = screen.getByRole("link", { name: "All variants" });
  expect(all.getAttribute("href")).toBe("/weightlifting/all~bench");
  expect(all.getAttribute("aria-current")).toBe("page");
  expect(all.getAttribute("data-replace")).toBe("true");
  expect(
    screen
      .getByRole("link", { name: "Bench Press (Default)" })
      .getAttribute("href"),
  ).toBe("/weightlifting/bench-press");
  expect(
    screen
      .getByRole("link", { name: "Incline Bench Press" })
      .getAttribute("href"),
  ).toBe("/weightlifting/incline-bench-press");
});
