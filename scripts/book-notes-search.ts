/**
 * Note search for agents: each argument is one query (one angle of the
 * question), and the output is JSON on stdout, the books ranked with their
 * best passages and chapter links. Read-only. Hermes runs it through
 * `.agents/skills/book-notes/scripts/search.sh`.
 *
 * Usage:
 *   search.sh "what trust is" "how trust is built" [--books 25] [--passages 3]
 */
// Env comes from `node --env-file` in search.sh: ~/server/db validates env
// at module-evaluation time, and ESM hoists imports above any statement.
import { searchNotesByMeaning } from "../src/lib/books/semanticNoteSearch";

function numberFlag(args: string[], name: string): number | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} needs a positive whole number`);
  args.splice(index, 2);
  return value;
}

async function main(): Promise<string> {
  const args = process.argv.slice(2);
  const maxBooks = numberFlag(args, "--books");
  const maxPassagesPerBook = numberFlag(args, "--passages");
  const result = await searchNotesByMeaning({
    queries: args,
    maxBooks,
    maxPassagesPerBook,
  });
  // Compact: the output goes into an agent's context, not a terminal.
  return `${JSON.stringify(result)}\n`;
}

// Exit only once stdout has drained: into a pipe the write is asynchronous,
// and exiting straight after it cut the JSON off at the pipe's 64 KB buffer.
main()
  .then((output) => process.stdout.write(output, () => process.exit(0)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
