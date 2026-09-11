/**
 * The scene's object notes: one caption per addressable thing in the 3D room,
 * authored by hand in `content/stacks/objects.md` and parsed by this file.
 *
 * Why markdown and not a TypeScript record: the file is prose the owner
 * writes and rewrites, ~230 entries of it, and a `.ts` literal makes every
 * edit a code edit — quoting, escaping, a build that fails on a stray
 * apostrophe. Markdown is the format the rest of his written content already
 * lives in.
 *
 * Why a parser and not a runtime markdown library: the shape here is fixed
 * and tiny, and this runs in the browser on a page with a route budget.
 *
 * The pipeline is: `content/stacks/objects.md` (authored) →
 * `scripts/generate/scene-object-notes.ts` → `public/data/scene-objects.json`
 * (committed) → fetched lazily by the scene when a caption is first needed.
 * `objectNotes.test.ts` re-runs the parser on the markdown and compares it to
 * the committed JSON, so a stale artifact fails the ordinary code gate rather
 * than shipping a caption that no longer matches what was written.
 */

export type ObjectNoteLink = Readonly<{ label: string; href: string }>;

export type ObjectNote = Readonly<{
  /** The object's stable id: a scene artifact id for a photograph, the
   * literal hoverKey for a prop, or a `family:*` template for the ones
   * generated in a loop. */
  id: string;
  title: string;
  /** `needs-owner` means the honest caption needs a fact only he has. The
   * body is empty and `needs` says what is missing. Never a placeholder
   * caption: an invented one is worse than none. */
  status: "written" | "needs-owner";
  /** Enabled in public caption UI. Hidden notes remain editable locally. */
  visitor: boolean;
  links: readonly ObjectNoteLink[];
  body: string;
  needs?: string;
}>;

const SECTION = /^##[ \t]+(.+?)[ \t]*$/;
const FIELD = /^([A-Za-z][A-Za-z-]*):[ \t]*(.*)$/;
const normalizeObjectNoteId = (id: string) => id.replaceAll("\\*", "*");

function parseSection(id: string, lines: string[]): ObjectNote | null {
  let title = "";
  let status: ObjectNote["status"] = "needs-owner";
  let visitor = false;
  const links: ObjectNoteLink[] = [];
  const body: string[] = [];
  let needs: string | undefined;
  let inBody = false;

  for (const line of lines) {
    // Checked before the field parse, not after: `NEEDS:` is shaped exactly
    // like a field and would otherwise be swallowed as an unknown one.
    if (line.startsWith("NEEDS:")) {
      needs = line.slice("NEEDS:".length).trim();
      continue;
    }
    if (!inBody) {
      const field = FIELD.exec(line);
      if (field) {
        const [, key, value] = field;
        const name = key!.toLowerCase();
        if (name === "title") title = value!.trim();
        else if (name === "status")
          status = value!.trim() === "written" ? "written" : "needs-owner";
        else if (name === "audience") visitor = value!.trim() === "visitor";
        else if (name === "link") {
          // "<label words> <https url>": split at the last space so a label
          // may contain spaces.
          const raw = value!.trim();
          const cut = raw.lastIndexOf(" ");
          if (cut > 0)
            links.push({
              label: raw.slice(0, cut).trim(),
              href: raw.slice(cut + 1).trim(),
            });
        }
        continue;
      }
      if (line.trim() === "") continue;
      inBody = true;
    }
    body.push(line);
  }

  if (!title) return null;
  const text = body.join("\n").trim();
  return {
    id,
    title,
    status: text ? status : "needs-owner",
    visitor,
    links,
    body: text,
    ...(needs ? { needs } : {}),
  };
}

/** Parse the authored file. Sections without a Title are skipped rather than
 * throwing: this runs over a file a person edits by hand, and one malformed
 * entry must not take the other 229 down with it. */
export function parseObjectNotes(markdown: string): ObjectNote[] {
  const notes: ObjectNote[] = [];
  let id: string | null = null;
  let lines: string[] = [];
  let inComment = false;

  const flush = () => {
    if (!id) return;
    const note = parseSection(id, lines);
    if (note) notes.push(note);
    id = null;
    lines = [];
  };

  for (const line of markdown.split("\n")) {
    // Comments are stripped HERE, across their whole span, and before the
    // heading scan. Skipping only the line that OPENS one left the other 51
    // lines of the file's coverage note sitting in the section above it, which
    // is how `egg:lamp:floor:6` shipped a caption with an id-migration list
    // glued to the end and a literal `-->` for a last word. Stripping ahead of
    // the `##` scan also stops a heading inside a comment opening a phantom
    // section.
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.trimStart().startsWith("<!--")) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }
    const heading = SECTION.exec(line);
    if (heading) {
      flush();
      id = normalizeObjectNoteId(heading[1]!.trim());
      continue;
    }
    if (id) lines.push(line);
  }
  flush();
  return notes;
}

export type ObjectNoteCaptionEdit = Readonly<{
  id: string;
  body?: string;
  visitor?: boolean;
}>;

/** Visibility changes preserve the prose, review status, and owner questions. */
export function updateObjectNoteCaptions(
  markdown: string,
  edits: readonly ObjectNoteCaptionEdit[],
): string {
  const original = indexObjectNotes(parseObjectNotes(markdown));
  const seen = new Set<string>();
  for (const edit of edits) {
    if (!original[edit.id]) throw new Error(`Unknown caption id: ${edit.id}`);
    if (seen.has(edit.id)) throw new Error(`Duplicate caption id: ${edit.id}`);
    seen.add(edit.id);
    if (edit.visitor !== undefined && typeof edit.visitor !== "boolean")
      throw new Error("Caption visibility must be a boolean");
    if (edit.body === undefined && edit.visitor === undefined)
      throw new Error("Caption edit is empty");
  }
  let updated = updateObjectNoteBodies(
    markdown,
    edits.flatMap((edit) =>
      edit.body === undefined ? [] : [{ id: edit.id, body: edit.body }],
    ),
  );
  for (const edit of edits) {
    if (edit.visitor === undefined) continue;
    const matches = [...updated.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)];
    const index = matches.findIndex(
      (match) => normalizeObjectNoteId(match[1]!.trim()) === edit.id,
    );
    const start = matches[index]!.index;
    const end = matches[index + 1]?.index ?? updated.length;
    const lines = updated.slice(start, end).split("\n");
    let audienceIndex = -1;
    let insertIndex = 1;
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (!line.trim() && insertIndex === 1) continue;
      if (!FIELD.test(line)) break;
      insertIndex = i + 1;
      if (/^audience:/i.test(line)) audienceIndex = i;
    }
    const audience = `Audience: ${edit.visitor ? "visitor" : "internal"}`;
    if (audienceIndex >= 0) lines[audienceIndex] = audience;
    else lines.splice(insertIndex, 0, audience);
    updated = updated.slice(0, start) + lines.join("\n") + updated.slice(end);
  }
  const result = indexObjectNotes(parseObjectNotes(updated));
  for (const edit of edits) {
    const note = result[edit.id]!;
    if (edit.visitor !== undefined && note.visitor !== edit.visitor)
      throw new Error(`Caption visibility did not save: ${edit.id}`);
    if (edit.visitor === true && (!note.body || note.status !== "written"))
      throw new Error(`Write a caption before enabling it: ${edit.id}`);
  }
  return updated;
}

/** Replace caption prose inside named sections while leaving every untouched
 * section exactly as authored. Intended for the local caption editor, not for
 * free-form Markdown editing. */
function updateObjectNoteBodies(
  markdown: string,
  edits: readonly Readonly<{ id: string; body: string }>[],
): string {
  const trailingNewlines = /\n*$/.exec(markdown)?.[0] ?? "";
  const originalIds = parseObjectNotes(markdown).map((note) => note.id);
  const byId = new Map<string, string>();
  for (const edit of edits) {
    const body = edit.body.trim();
    if (!edit.id.trim() || !body)
      throw new Error("Caption edits need an id and body");
    if (byId.has(edit.id)) throw new Error(`Duplicate caption id: ${edit.id}`);
    byId.set(edit.id, body);
  }

  const matches = [...markdown.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)];
  const known = new Set(
    matches.map((match) => normalizeObjectNoteId(match[1]!.trim())),
  );
  for (const id of byId.keys()) {
    if (!known.has(id)) throw new Error(`Unknown caption id: ${id}`);
  }

  let updated = markdown;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]!;
    const id = normalizeObjectNoteId(match[1]!.trim());
    const body = byId.get(id);
    if (!body) continue;
    const start = match.index;
    const end = matches[i + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    const lines = section.split("\n");
    const metadata: string[] = [];
    let sawMetadata = false;
    let metadataClosed = false;
    for (const line of lines.slice(1)) {
      if (metadataClosed) continue;
      if (!line.trim()) {
        if (sawMetadata) metadataClosed = true;
        continue;
      }
      if (line.startsWith("NEEDS:")) continue;
      if (!FIELD.test(line)) {
        metadataClosed = true;
        continue;
      }
      sawMetadata = true;
      metadata.push(
        line.toLowerCase().startsWith("status:") ? "Status: written" : line,
      );
    }
    if (!metadata.some((line) => line.startsWith("Status:"))) {
      const titleIndex = metadata.findIndex((line) =>
        line.startsWith("Title:"),
      );
      metadata.splice(titleIndex + 1, 0, "Status: written");
    }
    const replacement = `${lines[0]}\n\n${metadata.join("\n")}\n\n${body}\n\n`;
    updated = `${updated.slice(0, start)}${replacement}${updated.slice(end)}`;
  }
  updated = updated.replace(/\n*$/, trailingNewlines);
  const parsed = parseObjectNotes(updated);
  if (parsed.map((note) => note.id).join("\n") !== originalIds.join("\n"))
    throw new Error("Caption edit changed the document structure");
  const parsedById = indexObjectNotes(parsed);
  for (const [id, body] of byId) {
    if (parsedById[id]?.body !== body || parsedById[id]?.status !== "written")
      throw new Error(`Caption does not round-trip safely: ${id}`);
  }
  return updated;
}

export function indexObjectNotes(
  notes: readonly ObjectNote[],
): Record<string, ObjectNote> {
  const index: Record<string, ObjectNote> = {};
  for (const note of notes) index[note.id] = note;
  return index;
}

/**
 * Resolve a note for a runtime id, falling back to the `*` family template the
 * loop-generated props share. Three shapes occur:
 *
 *   grab:pills:bottle:3           → grab:pills:bottle:*     (last segment)
 *   link:row:1:68:2:0             → link:row:1:*:*:*        (a whole tail)
 *   shelf:about:top               → shelf:*:top             (the unit, middle)
 *
 * so the search is: the exact id; then a growing wildcard TAIL, which keeps
 * the most left-hand context; then a single wildcard walking right to left for
 * the middle case. Most specific always wins, and a family can never shadow an
 * object that wrote its own note.
 */
export function objectNoteFor(
  index: Record<string, ObjectNote>,
  id: string,
): ObjectNote | null {
  const exact = index[id];
  if (exact) return exact;
  const parts = id.split(":");

  for (let tail = 1; tail < parts.length; tail += 1) {
    const candidate = [
      ...parts.slice(0, parts.length - tail),
      ...Array<string>(tail).fill("*"),
    ];
    const note = index[candidate.join(":")];
    if (note) return note;
  }

  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const candidate = [...parts];
    candidate[i] = "*";
    const note = index[candidate.join(":")];
    if (note) return note;
  }

  return null;
}
