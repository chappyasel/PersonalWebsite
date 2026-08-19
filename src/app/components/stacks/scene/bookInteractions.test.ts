import { describe, expect, it } from "vitest";

import {
  type BookInteractionInput,
  auditBookInteractions,
  bookInteractionSnapshot,
  buildBookInteractions,
  respondersForHover,
  setBookInteractionInventory,
  setBookInteractionScreens,
} from "./bookInteractions";

const featured = Array.from({ length: 8 }, (_, index) => ({
  kind: "cover" as const,
  x: -1 + index * 0.2,
  url: `/cover-${index}.jpg`,
  key: `book-${index}`,
  riser: index % 3 === 0 ? 0.052 : 0,
}));

const input: BookInteractionInput = {
  unitIndex: 1,
  expectedFeaturedIds: featured.map((book) => book.key),
  rows: [
    {
      shelf: "top",
      salt: 16,
      role: "featured",
      items: featured.slice(0, 5),
    },
    {
      shelf: "lower",
      salt: 41,
      role: "featured",
      items: featured.slice(5),
    },
    {
      shelf: "top",
      salt: 15,
      role: "packed",
      items: [
        { kind: "spine", x: -0.8, w: 0.08, h: 0.5, color: "#765" },
        {
          kind: "flat",
          x: -0.4,
          n: 3,
          colors: ["#765", "#876", "#987"],
        },
        { kind: "lean", x: 0.1, w: 0.07, h: 0.44, color: "#654" },
      ],
    },
  ],
};

describe("Book Notes interaction inventory", () => {
  it("enumerates every physical volume with a unique authored response", () => {
    const inventory = buildBookInteractions(input);
    const audit = auditBookInteractions(inventory, input.expectedFeaturedIds);

    expect(audit).toEqual({ ok: true, errors: [] });
    expect(inventory.filter((item) => item.role === "featured")).toHaveLength(
      8,
    );
    expect(inventory.filter((item) => item.role === "flat")).toHaveLength(3);
    expect(inventory.filter((item) => item.role === "riser")).toHaveLength(3);
    expect(inventory.filter((item) => item.shimmer)).toEqual([]);
  });

  it("binds each featured cover to its exact detail id and carry gesture", () => {
    const covers = buildBookInteractions(input).filter(
      (item) => item.role === "featured",
    );

    expect(covers.map((item) => item.detailId)).toEqual(
      input.expectedFeaturedIds,
    );
    expect(covers.every((item) => item.response === "details-or-carry")).toBe(
      true,
    );
    expect(covers.every((item) => item.draggable)).toBe(true);
  });

  it("never invents a details target for decorative volumes", () => {
    const decorative = buildBookInteractions(input).filter(
      (item) => item.role !== "featured",
    );

    expect(decorative.every((item) => item.detailId === undefined)).toBe(true);
    expect(
      decorative.every((item) => item.response !== "details-or-carry"),
    ).toBe(true);
  });

  it("lets one hover key carry exactly one physical volume", () => {
    const inventory = buildBookInteractions(input);

    for (const item of inventory) {
      expect(respondersForHover(inventory, item.hoverKey)).toEqual([item.id]);
    }
    expect(inventory.every((item) => item.draggable)).toBe(true);
    expect(inventory.every((item) => item.hoverMotion === "carry")).toBe(true);
  });

  it("fails closed when interaction keys collide", () => {
    const inventory = buildBookInteractions(input);
    const broken = [
      ...inventory,
      {
        ...inventory[0]!,
        id: "counterfeit",
        role: "spine" as const,
      },
    ];

    const audit = auditBookInteractions(broken, input.expectedFeaturedIds);
    expect(audit.ok).toBe(false);
    expect(audit.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("duplicate hover key")]),
    );
  });

  it("publishes measured screen centres for a real-pointer harness", () => {
    setBookInteractionInventory(input);
    setBookInteractionScreens({
      "featured:book-0": [212, 418],
    });

    const snapshot = bookInteractionSnapshot();
    expect(snapshot.audit.ok).toBe(true);
    expect(
      snapshot.inventory.find((item) => item.id === "featured:book-0")?.screen,
    ).toEqual([212, 418]);
    setBookInteractionInventory(null);
  });
});
