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
  links: readonly ObjectNoteLink[];
  body: string;
  needs?: string;
}>;

const SECTION = /^##[ \t]+(.+?)[ \t]*$/;
const FIELD = /^([A-Za-z][A-Za-z-]*):[ \t]*(.*)$/;

function parseSection(id: string, lines: string[]): ObjectNote | null {
  let title = "";
  let status: ObjectNote["status"] = "needs-owner";
  const links: ObjectNoteLink[] = [];
  const body: string[] = [];
  let needs: string | undefined;
  let inBody = false;

  for (const line of lines) {
    // HTML comments are the file's unit separators and its coverage note.
    if (line.startsWith("<!--")) continue;
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

  const flush = () => {
    if (!id) return;
    const note = parseSection(id, lines);
    if (note) notes.push(note);
    id = null;
    lines = [];
  };

  for (const line of markdown.split("\n")) {
    const heading = SECTION.exec(line);
    if (heading) {
      flush();
      id = heading[1]!.trim();
      continue;
    }
    if (id) lines.push(line);
  }
  flush();
  return notes;
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
