// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import RoomDocument from "./RoomDocument";

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
