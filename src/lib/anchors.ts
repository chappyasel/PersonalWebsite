/**
 * One slug rule for every in-page anchor the site mints from authored text:
 * dropdown titles and content headings on the Notion documents (stamped by
 * the sync), chapter headings in a book's notes (computed as they render).
 *
 * "🧠 Knowledge" → "knowledge", "Deep Think Weeks (72h)" → "deep-think-weeks",
 * "Chappy's Book Notes:" → "chappys-book-notes". A leading icon, a workspace
 * emoji shortcode, a trailing parenthetical, trailing ":" or ".", and
 * apostrophes are dropped before slugging; everything else non-alphanumeric
 * becomes one hyphen.
 */
export function anchorSlug(text: string): string {
  return (
    text
      // A leading pictograph (with its variation selector, skin tone, or ZWJ
      // sequence) or a keycap ("#️⃣"); a bare digit is kept, since
      // Unicode files digits under \p{Emoji} and "7 Habits" must stay "7".
      .replace(
        /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*|[#*0-9]\uFE0F?\u20E3)\s*/u,
        "",
      )
      .replace(/^:[a-z0-9_-]+:\s*/i, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/[:.]\s*$/, "")
      .replace(/[’'"]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/**
 * The text of a heading's rendered children, for a slug: strings joined,
 * elements descended. Used where the heading arrives as React nodes (the
 * book notes' markdown) rather than as authored text.
 */
export function textOfChildren(children: unknown): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textOfChildren).join("");
  if (typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: unknown } }).props;
    return textOfChildren(props?.children);
  }
  return "";
}

/** Hands out ids that are unique within one page render: a second
 * "Notes" heading becomes "notes-2". */
export function uniqueAnchor(base: string, taken: Set<string>): string {
  const root = base || "section";
  let id = root;
  for (let n = 2; taken.has(id); n++) id = `${root}-${n}`;
  taken.add(id);
  return id;
}
