/**
 * Whether the automation is allowed to set a page's icon.
 *
 * The rule that matters: once a person changes an icon by hand, the automation
 * stops touching that page. Ownership comes only from this page's own durable
 * record of what the automation last set. Neither a name prefix nor the
 * presence of some file in the workspace proves anything about who put it
 * there, and an earlier version of this module that inferred ownership from
 * the workspace emoji library was wrong in a way that would have silently
 * overwritten unrelated icons.
 *
 * The first pass is the exception. A page the automation has never touched may
 * have an ordinary icon, or none, and the backfill is authorized to replace
 * it. The previous icon is written to the record before the PATCH, so the
 * change stays reversible by hand.
 */

export type PageIcon =
  | { type: "custom_emoji"; id: string; name?: string; url?: string }
  | { type: "emoji"; emoji: string }
  | { type: "external"; url: string }
  | { type: "file"; url: string }
  | { type: "file_upload"; id: string }
  | { type: "icon"; name: string }
  | null;

/**
 * Decode the icon exactly as the API returns it.
 *
 * The wire shape nests: a custom emoji arrives as
 * `{ type: "custom_emoji", custom_emoji: { id, name, url } }`, not as a
 * flattened object with an `id` on the outside. Casting the raw JSON to the
 * internal shape looked fine to the compiler and silently produced an
 * undefined id, which made every readback comparison fail and every ownership
 * check fall through to "changed by hand". Decoding is the fix, and the tests
 * for it are driven by captures from the live API.
 */
export function decodePageIcon(raw: unknown): PageIcon {
  if (!raw || typeof raw !== "object") return null;
  const icon = raw as Record<string, unknown>;
  const nested = (key: string) =>
    icon[key] as Record<string, unknown> | undefined;
  switch (icon.type) {
    case "custom_emoji": {
      const inner = nested("custom_emoji");
      const id = typeof inner?.id === "string" ? inner.id : null;
      if (!id) return null;
      return {
        type: "custom_emoji",
        id,
        ...(typeof inner?.name === "string" ? { name: inner.name } : {}),
        ...(typeof inner?.url === "string" ? { url: inner.url } : {}),
      };
    }
    case "emoji":
      return typeof icon.emoji === "string"
        ? { type: "emoji", emoji: icon.emoji }
        : null;
    case "external": {
      const inner = nested("external");
      return typeof inner?.url === "string"
        ? { type: "external", url: inner.url }
        : null;
    }
    case "file": {
      const inner = nested("file");
      return typeof inner?.url === "string"
        ? { type: "file", url: inner.url }
        : null;
    }
    case "file_upload": {
      const inner = nested("file_upload");
      return typeof inner?.id === "string"
        ? { type: "file_upload", id: inner.id }
        : null;
    }
    case "icon": {
      const inner = nested("icon");
      return typeof inner?.name === "string"
        ? { type: "icon", name: inner.name }
        : null;
    }
    default:
      return null;
  }
}

/**
 * The stable half of a Notion file URL.
 *
 * A file icon reads back as a presigned S3 URL whose query string carries a
 * fresh one-hour credential on every single read, so comparing whole URLs
 * would report "changed by hand" every time. The path
 * (`/<workspace>/<attachment>/<filename>`) was identical across repeated reads
 * and across two different pages sharing one upload, measured on 2026-09-15,
 * and that is what identity compares.
 *
 * Returns null for a URL that will not parse, so a malformed icon can never
 * compare equal to a real one.
 */
export function fileUrlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * What the automation last set on a page, in a form that survives in storage
 * and can be compared against a fresh read.
 *
 * `custom_emoji` is the retired browser path's shape. It stays because the
 * pages it applied to are real and their receipts are the only proof that the
 * icons on them are ours rather than somebody's own choice.
 */
export type OwnedIcon =
  | { kind: "custom_emoji"; id: string }
  | { kind: "file"; urlKey: string };

/** The comparable identity of a live icon, or null if it has none. */
export function iconIdentity(icon: PageIcon): OwnedIcon | null {
  if (!icon) return null;
  if (icon.type === "custom_emoji") return { kind: "custom_emoji", id: icon.id };
  if (icon.type === "file") {
    const urlKey = fileUrlKey(icon.url);
    return urlKey ? { kind: "file", urlKey } : null;
  }
  return null;
}

export function sameOwnedIcon(
  a: OwnedIcon | null,
  b: OwnedIcon | null,
): boolean {
  if (!a || a.kind !== b?.kind) return false;
  if (a.kind === "custom_emoji") {
    return b.kind === "custom_emoji" && a.id === b.id;
  }
  return b.kind === "file" && a.urlKey === b.urlKey;
}

export type IconDecision = {
  action: "apply" | "skip";
  reason:
    | "backfill"
    | "automation-owned"
    | "already-correct"
    | "unknown-image-icon"
    | "changed-by-hand";
};

/**
 * Whether the automation may set this page's icon.
 *
 * `owned` is what the record says the automation last put here, or null if it
 * has never successfully touched this page. `target` is the icon it wants the
 * page to end up wearing, or null when the artwork has changed and the target
 * does not exist yet.
 *
 * Without a record, an image icon of unknown provenance means stand down: a
 * file or custom emoji someone chose themselves is not ours to replace. A
 * plain emoji, a built-in icon, an external URL, or no icon at all is what the
 * authorized backfill covers, which is what the before-snapshot showed.
 */
export function decideIcon(
  current: PageIcon,
  target: OwnedIcon | null,
  owned: OwnedIcon | null,
): IconDecision {
  const identity = iconIdentity(current);

  if (target && sameOwnedIcon(identity, target)) {
    return { action: "skip", reason: "already-correct" };
  }
  if (owned === null) {
    if (current?.type === "custom_emoji" || current?.type === "file") {
      return { action: "skip", reason: "unknown-image-icon" };
    }
    return { action: "apply", reason: "backfill" };
  }
  if (sameOwnedIcon(identity, owned)) {
    return { action: "apply", reason: "automation-owned" };
  }
  return { action: "skip", reason: "changed-by-hand" };
}

/** A compact record of what was there before, for logs and receipts. */
export function describeIcon(icon: PageIcon): string {
  if (!icon) return "none";
  switch (icon.type) {
    case "custom_emoji":
      return `custom_emoji:${icon.id}`;
    case "emoji":
      return `emoji:${icon.emoji}`;
    case "file_upload":
      return `file_upload:${icon.id}`;
    case "file":
      return `file:${fileUrlKey(icon.url) ?? "unparsable"}`;
    case "icon":
      return `icon:${icon.name}`;
    default:
      return icon.type;
  }
}
