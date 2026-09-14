// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { type ReactNode, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import RoomDocument from "./RoomDocument";

it("renders caller-owned section slots without React key warnings", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  // Streamed RSC slots use lazy nodes. Their element can resolve after JSX
  // has validated the parent's static children, during reconciliation.
  const content = <p>Training content</p>;
  const training = {
    $$typeof: Symbol.for("react.lazy"),
    _payload: { status: "pending" },
    _store: { validated: 0 },
    _init: () => content,
  } as unknown as ReactNode;
  function HomePageContent() {
    const slots = {
      training,
      about: <p>About content</p>,
      quotes: <p>A quote</p>,
    };
    return <RoomDocument slots={slots} />;
  }
  try {
    await act(async () => {
      render(
        <Suspense>
          <HomePageContent />
        </Suspense>,
      );
    });
    expect(screen.getByText("Training content")).toBeTruthy();
    expect(screen.getByText("A quote")).toBeTruthy();
    expect(
      error.mock.calls.filter((args) =>
        args.some(
          (arg) => typeof arg === "string" && arg.includes('unique "key"'),
        ),
      ),
    ).toEqual([]);
  } finally {
    cleanup();
    error.mockRestore();
  }
});

vi.mock("./IllustrationStage", () => ({
  IllustrationStage: ({ unitIndex }: { unitIndex: number }) => (
    <svg data-drawing={unitIndex} />
  ),
}));
afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  history.replaceState(null, "", "/");
});

it.each([0, 1, 1.52, 2, 3, 4, 5, 6])(
  "server-renders stop %s with native links and readable content",
  (initialUnit) => {
    document.body.innerHTML = renderToStaticMarkup(
      <RoomDocument
        initialUnit={initialUnit}
        slots={{ projects: <p>Projects remain readable.</p> }}
      />,
    );
    const selected = document.querySelector("[data-document-default]")!;
    expect(
      selected
        .querySelector("[data-document-drawing]")
        ?.getAttribute("data-document-drawing"),
    ).toBe(String(initialUnit));
    expect(document.querySelectorAll(".room-document-section")).toHaveLength(8);
    for (const link of document.querySelectorAll<HTMLAnchorElement>("nav a"))
      expect(document.getElementById(link.hash.slice(1))).not.toBeNull();
    expect(document.getElementById("projects")?.textContent).toContain(
      "Projects remain readable.",
    );
    expect(document.querySelector(".stacks-flat, canvas")).toBeNull();
  },
);

it("selects a native fragment before hydration", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(
    "src/app/components/stacks/illustration/roomDocument.css",
    "utf8",
  );
  document.head.append(style);
  document.body.innerHTML = renderToStaticMarkup(
    <RoomDocument initialUnit={4} />,
  );
  const projects = document.getElementById("projects")!;
  const books = document.getElementById("books")!;
  expect(getComputedStyle(projects).display).toBe("grid");
  expect(getComputedStyle(books).display).toBe("none");
  history.replaceState(null, "", "/#books");
  document.body.innerHTML = renderToStaticMarkup(
    <RoomDocument initialUnit={4} />,
  );
  expect(getComputedStyle(document.getElementById("projects")!).display).toBe(
    "none",
  );
  expect(getComputedStyle(document.getElementById("books")!).display).toBe(
    "grid",
  );
});
