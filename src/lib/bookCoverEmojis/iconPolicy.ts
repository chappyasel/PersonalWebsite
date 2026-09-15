/**
 * Whether the worker is allowed to set a page's icon.
 *
 * The rule that matters: once a person changes an icon by hand, the
 * automation stops touching that page. The worker knows what it last set,
 * from its receipts, so an icon that no longer matches its own last write is
 * somebody else's decision.
 *
 * The exception is the first pass. A page the automation has never touched
 * may have an ordinary icon, or none, and the backfill is authorized to
 * replace it. The previous icon goes into the receipt first, so the change is
 * reversible by hand.
 */

export type PageIcon =
  | { type: "custom_emoji"; id: string; name?: string; url?: string }
  | { type: "emoji"; emoji: string }
  | { type: "external"; url: string }
  | { type: "file"; url: string }
  | { type: "file_upload"; id: string }
  | null;

/**
 * Decode the icon exactly as the API returns it.
 *
 * The wire shape nests: a custom emoji arrives as
 * `{ type: "custom_emoji", custom_emoji: { id, name, url } }`, not as a
 * flattened object with an `id` on the outside. Casting the raw JSON to the
 * internal shape looked fine to the compiler and silently produced an
 * undefined id, which made every readback comparison fail and every ownership
 * check fall through to "changed by hand". Decoding is the fix, and it has to
 * be driven by fixtures that look like real responses.
 */
export function decodePageIcon(raw: unknown): PageIcon {
  if (!raw || typeof raw !== "object") return null;
  const icon = raw as Record<string, unknown>;
  switch (icon.type) {
    case "custom_emoji": {
      const inner = icon.custom_emoji as Record<string, unknown> | undefined;
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
      const inner = icon.external as Record<string, unknown> | undefined;
      return typeof inner?.url === "string"
        ? { type: "external", url: inner.url }
        : null;
    }
    case "file": {
      const inner = icon.file as Record<string, unknown> | undefined;
      return typeof inner?.url === "string" ? { type: "file", url: inner.url } : null;
    }
    case "file_upload": {
      const inner = icon.file_upload as Record<string, unknown> | undefined;
      return typeof inner?.id === "string"
        ? { type: "file_upload", id: inner.id }
        : null;
    }
    default:
      return null;
  }
}

export type IconDecision = {
  action: "apply" | "skip";
  reason:
    | "backfill"
    | "automation-owned"
    | "already-correct"
    | "unknown-custom-icon"
    | "changed-by-hand";
};

/**
 * Whether the worker may set a page's icon.
 *
 * Ownership comes only from this page's own record. An earlier version also
 * treated any custom emoji in the workspace library as ours, which was wrong
 * in a way that would have been hard to notice: the library holds every
 * personal emoji in the workspace, so after a state loss a page wearing an
 * unrelated one read as automation-owned and would have been overwritten.
 * Neither the library nor a name prefix proves anything about who set an icon.
 *
 * Without a record, a custom emoji of unknown provenance means stand down. The
 * authorized backfill covers pages with no icon or an ordinary one, which is
 * what the before-snapshot showed, and nothing else.
 */
export function decideIcon(
  current: PageIcon,
  targetEmojiId: string,
  lastAppliedEmojiId: string | null,
): IconDecision {
  if (current?.type === "custom_emoji" && current.id === targetEmojiId) {
    return { action: "skip", reason: "already-correct" };
  }
  if (lastAppliedEmojiId === null) {
    if (current?.type === "custom_emoji") {
      // Someone put this here and we have no record of doing it.
      return { action: "skip", reason: "unknown-custom-icon" };
    }
    return { action: "apply", reason: "backfill" };
  }
  if (current?.type === "custom_emoji" && current.id === lastAppliedEmojiId) {
    return { action: "apply", reason: "automation-owned" };
  }
  return { action: "skip", reason: "changed-by-hand" };
}

/** A compact record of what was there before, for the receipt. */
export function describeIcon(icon: PageIcon): string {
  if (!icon) return "none";
  switch (icon.type) {
    case "custom_emoji":
      return `custom_emoji:${icon.id}`;
    case "emoji":
      return `emoji:${icon.emoji}`;
    case "file_upload":
      return `file_upload:${icon.id}`;
    default:
      return icon.type;
  }
}
