import type { StacksData } from "../data";
import { ABOUT_ROLES } from "../scene/aboutRoleIcons";
import { destinationFor } from "../scene/interactionRegistry";
import { expect, it } from "vitest";

import geometry from "./artwork/hotspots.generated.json";
import { illustrationLabel } from "./illustrationLabels";

const data = {
  readingBooks: [{ id: "current", title: "Current read", author: "Author" }],
  featuredBooks: [
    { id: "superminds", title: "Superminds", author: "Thomas Malone" },
  ],
  spineBooks: [],
} as unknown as StacksData;

it("resolves covers by identity and never assigns new books to stale artwork", () => {
  expect(
    illustrationLabel(1, "stacks-cover-superminds", data, "View book notes"),
  ).toMatchObject({
    title: "Superminds",
    bookId: "superminds",
    action: "View book notes",
  });
  expect(
    illustrationLabel(0, "reading-book:current", data, "Preview book notes"),
  ).toMatchObject({
    title: "Current read",
    bookId: "current",
    action: "Preview book notes",
  });
  expect(
    illustrationLabel(1, "stacks-cover-removed", data, "View book notes"),
  ).toBeNull();
});
it("shares the role titles, descriptions, and destinations with 3D", () => {
  for (const role of ABOUT_ROLES)
    expect(
      illustrationLabel(0, `role:${role.id}`, data, "View book notes"),
    ).toMatchObject({
      title: role.portalLabel,
      detail: role.portalDetail,
      href: role.href,
    });
});
it.each([
  [0, "globe"],
  [0, "vision-pro"],
  [4, "mac"],
  [4, "shimmer-apple"],
  [4, "arduino"],
  [4, "card"],
  [4, "action-projects-homework"],
  [4, "action-projects-weightlifting"],
] as const)(
  "keeps %s/%s informational when its action needs 3D",
  (unit, id) => {
    const label = illustrationLabel(unit, id, data, "View book notes");
    expect(label?.title).toBeTruthy();
    expect(label?.action).toBeUndefined();
    expect(label?.href).toBeUndefined();
  },
);
it("keeps quiet scenery and undisclosed eggs out of the target list", () => {
  for (const [unit, id] of [
    [0, "succulent"],
    [1, "books-bookend-top"],
    [3, "egg-clock-alarm"],
    [5, "egg-tea"],
  ] as const)
    expect(illustrationLabel(unit, id, data, "View book notes")).toBeNull();
});
it("offers the same library destination for captured background rows", () => {
  const label = illustrationLabel(
    1,
    "books-packed-top",
    data,
    "View book notes",
  );
  expect(label).toMatchObject({
    title: destinationFor("books").label,
    href: destinationFor("books").href,
    action: destinationFor("books").actionLabel,
  });
  expect(label?.bookId).toBeUndefined();
});
it("has target geometry in every artwork theme and viewport for supported objects", () => {
  const required: Record<number, string[]> = {
    1: ["books-packed-top", "books-packed-lower", "stacks-cover-superminds"],
    2: ["grab-dumbbell-training-left", "grab-dumbbell-training-right"],
    3: ["systems-manual-row", "link-routineboard"],
    4: [
      "action-projects-homework",
      "action-projects-weightlifting",
      "mac",
      "shimmer-apple",
      "arduino",
      "card",
      "link-projects-dice-top",
    ],
    5: [
      "grab-openbook",
      "musings-book-row",
      "grab-headphones",
      "grab-trust-essay-musings",
    ],
  };
  for (const [key, capture] of Object.entries(geometry)) {
    const unit = Number(key.split("/")[0]);
    for (const id of required[unit] ?? []) {
      const part = capture.parts.find((part) => part.id === id);
      expect(part, `${key}/${id}`).toBeDefined();
      expect(part!.box[2]).toBeGreaterThan(0);
      expect(part!.box[3]).toBeGreaterThan(0);
      expect(
        illustrationLabel(unit, id, data, "View book notes"),
      ).not.toBeNull();
    }
  }
});
