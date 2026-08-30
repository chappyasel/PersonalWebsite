// Bakes the hand-written scene captions into the file the browser reads.
//
//   pnpm generate:scene-objects
//
// Source:  content/stacks/objects.md   (authored, one `## <id>` per object)
// Output:  public/data/scene-objects.json  (committed)
//
// The browser never parses the markdown: the scene fetches this JSON lazily,
// only when a caption is first needed, so ~230 notes cost the homepage bundle
// nothing. `src/lib/stacks/objectNotes.test.ts` re-runs the parser on the
// markdown and fails if this file is stale, which keeps the check inside the
// ordinary code gate — no build, no credentials.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseObjectNotes } from "../../src/lib/stacks/objectNotes.js";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "../../content/stacks/objects.md");
const OUTPUT = join(here, "../../public/data/scene-objects.json");

const notes = parseObjectNotes(readFileSync(SOURCE, "utf8"));
writeFileSync(OUTPUT, `${JSON.stringify(notes, null, 2)}\n`);

const written = notes.filter((note) => note.status === "written").length;
console.log(
  `scene-objects  ${notes.length} notes  ${written} written  ${
    notes.length - written
  } awaiting the owner`,
);
