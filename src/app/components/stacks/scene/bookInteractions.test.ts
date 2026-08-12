import { describe, expect, it } from "vitest";

import {
  type BookInteractionInput,
  auditBookInteractions,
  bookInteractionSnapshot,
  buildBookInteractions,
  pickSecretSpineIndex,
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

  it("lets one hover key animate one volume and uses collision-safe motion", () => {
    const inventory = buildBookInteractions(input);

    for (const item of inventory) {
      expect(respondersForHover(inventory, item.hoverKey)).toEqual([item.id]);
    }
    expect(
      inventory
        .filter((item) => item.role === "flat" || item.role === "riser")
        .every((item) => item.hoverMotion === "forward-z"),
    ).toBe(true);
  });

  it("fails closed when keys collide or a disabled secret shimmer returns", () => {
    const inventory = buildBookInteractions(input);
    const broken = [
      ...inventory,
      {
        ...inventory[0]!,
        id: "counterfeit",
        role: "spine" as const,
        shimmer: true,
      },
    ];

    const audit = auditBookInteractions(broken, input.expectedFeaturedIds);
    expect(audit.ok).toBe(false);
    expect(audit.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicate hover key"),
        expect.stringContaining("secret-room shimmer must stay disabled"),
      ]),
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

  it("always chooses the closest available spine for the secret handle", () => {
    expect(
      pickSecretSpineIndex([
        { kind: "flat", x: -0.38, n: 2, colors: ["#123", "#456"] },
        { kind: "spine", x: -0.8, w: 0.08, h: 0.5, color: "#765" },
        { kind: "lean", x: -0.37, w: 0.07, h: 0.44, color: "#654" },
        { kind: "spine", x: -0.32, w: 0.08, h: 0.5, color: "#876" },
      ]),
    ).toBe(3);
    expect(
      pickSecretSpineIndex([
        { kind: "flat", x: -0.38, n: 2, colors: ["#123", "#456"] },
      ]),
    ).toBe(-1);
  });

  it("chooses the rightmost unoccupied placeholder instead of clipping a cover", () => {
    const items = [
      { kind: "spine" as const, x: -0.5, w: 0.08, h: 0.5, color: "#765" },
      { kind: "spine" as const, x: 0.2, w: 0.08, h: 0.5, color: "#876" },
      { kind: "spine" as const, x: 0.72, w: 0.08, h: 0.5, color: "#987" },
    ];

    expect(pickSecretSpineIndex(items, 0.2, [[0.1, 0.4]])).toBe(2);
    expect(
      pickSecretSpineIndex(items, 0.2, [
        [-0.6, -0.4],
        [0.1, 0.8],
      ]),
    ).toBe(-1);
  });
});
