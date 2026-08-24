import type { RowItem } from "./primitives";

export type BookShelf = "top" | "lower";
export type BookInteractionRole =
  | "featured"
  | "riser"
  | "spine"
  | "flat"
  | "lean";
export type BookInteractionResponse = "details-or-carry" | "library-or-carry";
export type BookHoverMotion = "carry";

export type BookInteraction = {
  /** Stable physical-volume identity, not a title or a route. */
  id: string;
  shelf: BookShelf;
  role: BookInteractionRole;
  hoverKey: string;
  nodeName: string;
  response: BookInteractionResponse;
  hoverMotion: BookHoverMotion;
  draggable: boolean;
  shimmer: boolean;
  /** The library book this volume opens. Present for a featured cover and for
   * any packed volume that carries a real read; absent for pure scenery,
   * which opens the library index instead. */
  detailId?: string;
};

export type BookInteractionRow = {
  shelf: BookShelf;
  salt: number;
  role: "featured" | "packed";
  items: RowItem[];
};

export type BookInteractionInput = {
  unitIndex: number;
  expectedFeaturedIds: string[];
  rows: BookInteractionRow[];
};

/** Shared by the rendered row and its diagnostic inventory. If a volume has
 * a distinct key here, the store's single hovered slot can animate it without
 * moving its neighbours. */
export function bookRowHoverKey(
  unitIndex: number | undefined,
  salt: number,
  itemIndex: number,
  volumeIndex?: number,
) {
  const suffix =
    volumeIndex === undefined ? `${itemIndex}` : `${itemIndex}:${volumeIndex}`;
  return `link:row:${unitIndex}:${salt}:${suffix}`;
}

export function bookRowNodeName(
  kind: "spine" | "lean" | "flat",
  unitIndex: number | undefined,
  salt: number,
  itemIndex: number,
  volumeIndex?: number,
) {
  const suffix =
    volumeIndex === undefined ? `${itemIndex}` : `${itemIndex}:${volumeIndex}`;
  // Leaners share the stable named wrapper with upright spines; flats get
  // their own directly named volume.
  const prefix = kind === "flat" ? "stacks-flat" : "stacks-spine";
  return `${prefix}:${unitIndex}:${salt}:${suffix}`;
}

export function featuredRiserHoverKey(
  unitIndex: number | undefined,
  bookId: string,
) {
  return `link:riser:${unitIndex}:${bookId}`;
}

function inventoryForRow(
  row: BookInteractionRow,
  unitIndex: number,
): BookInteraction[] {
  return row.items.flatMap((item, itemIndex): BookInteraction[] => {
    if (item.kind === "cover") {
      const hoverKey = `book:${item.key}`;
      const cover: BookInteraction = {
        id: `featured:${item.key}`,
        shelf: row.shelf,
        role: "featured",
        hoverKey,
        nodeName: `nod:${hoverKey}`,
        response: "details-or-carry",
        hoverMotion: "carry",
        draggable: true,
        shimmer: false,
        detailId: item.key,
      };
      if (!(item.riser && item.riser > 0)) return [cover];
      const riserHoverKey = featuredRiserHoverKey(unitIndex, item.key);
      return [
        cover,
        {
          id: `riser:${item.key}`,
          shelf: row.shelf,
          role: "riser",
          hoverKey: riserHoverKey,
          nodeName: `nod:${riserHoverKey}`,
          response: "library-or-carry",
          hoverMotion: "carry",
          draggable: true,
          shimmer: false,
        },
      ];
    }

    if (item.kind === "flat") {
      return item.colors.map((_, volumeIndex) => {
        const hoverKey = bookRowHoverKey(
          unitIndex,
          row.salt,
          itemIndex,
          volumeIndex,
        );
        const book = item.books?.[volumeIndex];
        return {
          id: `flat:${row.shelf}:${row.salt}:${itemIndex}:${volumeIndex}`,
          shelf: row.shelf,
          role: "flat",
          hoverKey,
          nodeName: bookRowNodeName(
            "flat",
            unitIndex,
            row.salt,
            itemIndex,
            volumeIndex,
          ),
          response: book ? "details-or-carry" : "library-or-carry",
          hoverMotion: "carry",
          draggable: true,
          shimmer: false,
          ...(book ? { detailId: book.id } : {}),
        };
      });
    }

    const hoverKey = bookRowHoverKey(unitIndex, row.salt, itemIndex);
    // A packed volume holding a real read opens THAT read. The row behind the
    // featured rank is the rest of the library rather than a picture of one,
    // so "library-or-carry" is now the fallback for leftover scenery only.
    const book = item.book;
    return [
      {
        id: `${item.kind}:${row.shelf}:${row.salt}:${itemIndex}`,
        shelf: row.shelf,
        role: item.kind,
        hoverKey,
        nodeName: bookRowNodeName(item.kind, unitIndex, row.salt, itemIndex),
        response: book ? "details-or-carry" : "library-or-carry",
        hoverMotion: "carry",
        draggable: true,
        shimmer: false,
        ...(book ? { detailId: book.id } : {}),
      },
    ];
  });
}

export function buildBookInteractions(
  input: BookInteractionInput,
): BookInteraction[] {
  const books = input.rows.flatMap((row) =>
    inventoryForRow(row, input.unitIndex),
  );
  return books;
}

export function respondersForHover(
  inventory: BookInteraction[],
  hoverKey: string,
) {
  return inventory
    .filter((item) => item.hoverKey === hoverKey)
    .map((item) => item.id);
}

export function auditBookInteractions(
  inventory: BookInteraction[],
  expectedFeaturedIds: string[],
) {
  const errors: string[] = [];
  const duplicates = (field: "id" | "hoverKey" | "nodeName") => {
    const label =
      field === "hoverKey"
        ? "hover key"
        : field === "nodeName"
          ? "node name"
          : field;
    const seen = new Set<string>();
    for (const item of inventory) {
      if (seen.has(item[field]))
        errors.push(`duplicate ${label}: ${item[field]}`);
      seen.add(item[field]);
    }
  };
  duplicates("id");
  duplicates("hoverKey");
  duplicates("nodeName");

  for (const id of expectedFeaturedIds) {
    const matches = inventory.filter(
      (item) => item.role === "featured" && item.detailId === id,
    );
    if (matches.length !== 1)
      errors.push(`featured detail id ${id} has ${matches.length} targets`);
    const item = matches[0];
    if (item && (item.response !== "details-or-carry" || !item.draggable))
      errors.push(`featured detail id ${id} is not tap-or-carry`);
  }
  const extraFeatured = inventory.filter(
    (item) =>
      item.role === "featured" &&
      (!item.detailId || !expectedFeaturedIds.includes(item.detailId)),
  );
  if (extraFeatured.length)
    errors.push(`unexpected featured targets: ${extraFeatured.length}`);

  // ONE BOOK, ONE DOOR. Packed volumes carry real reads now, so "has a detail
  // target" no longer means "is a featured cover" — but a book appearing both
  // cover-out in front and spine-out behind is two doors onto one book, and
  // the shelf would be lying about how many books are on it. That is the
  // invariant this replaces the old role check with, and it is the one the
  // row builder can actually get wrong.
  const seenDetail = new Set<string>();
  for (const item of inventory) {
    if (item.detailId !== undefined) {
      if (seenDetail.has(item.detailId))
        errors.push(`book ${item.detailId} is shelved twice`);
      seenDetail.add(item.detailId);
    }
    // A volume promises its outcome through its response. Details without a
    // book to open, or a book with no way to open it, are both dead taps.
    if (
      (item.response === "details-or-carry") !==
      (item.detailId !== undefined)
    )
      errors.push(`${item.id} promises a response it cannot perform`);
    if (item.draggable && item.hoverMotion !== "carry")
      errors.push(`${item.id} does not expose its carry response`);
  }

  return { ok: errors.length === 0, errors };
}

let runtimeInput: BookInteractionInput | null = null;
let runtimeInventory: BookInteraction[] = [];
let runtimeScreens: Record<string, [number, number]> = {};

export function setBookInteractionInventory(
  input: BookInteractionInput | null,
) {
  runtimeInput = input;
  runtimeInventory = input ? buildBookInteractions(input) : [];
  if (!input) runtimeScreens = {};
}

export function setBookInteractionScreens(
  screens: Record<string, [number, number]>,
) {
  runtimeScreens = screens;
}

export function bookInteractionSnapshot() {
  const expected = runtimeInput?.expectedFeaturedIds ?? [];
  return {
    count: runtimeInventory.length,
    expectedFeaturedIds: [...expected],
    inventory: runtimeInventory.map((item) => ({
      ...item,
      screen: runtimeScreens[item.id]
        ? ([...runtimeScreens[item.id]!] as [number, number])
        : null,
    })),
    audit: auditBookInteractions(runtimeInventory, expected),
  };
}

declare global {
  interface Window {
    __bookNotesInteractions?: {
      snapshot: typeof bookInteractionSnapshot;
      responders: (hoverKey: string) => string[];
    };
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__bookNotesInteractions = {
    snapshot: bookInteractionSnapshot,
    responders: (hoverKey) => respondersForHover(runtimeInventory, hoverKey),
  };
}
