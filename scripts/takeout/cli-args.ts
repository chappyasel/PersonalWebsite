/**
 * Strict argument parsing for the Takeout CLIs, run before anything else.
 *
 * The old entry points took `--timeout` and `--no-headed` and ignored what they
 * did not recognise. An operator reaching for a flag that moved would get a
 * silent change of behaviour — a headed browser from a script that meant to run
 * headless, say — so an unknown or retired flag is now an error, and `--help`
 * answers before any cookie is read, any state written, or any process spawned.
 */

export type ArgSpec = {
  /** Boolean switches, e.g. `--dry-run`. */
  flags?: readonly string[];
  /** Options that take the next argv entry, e.g. `--wait 20`. */
  values?: readonly string[];
  /** Flags that existed once and must not be silently ignored. */
  retired?: readonly string[];
  usage: string;
};

export type ParsedArgs = {
  help: boolean;
  flags: Set<string>;
  values: Map<string, string>;
};

export class CliArgError extends Error {
  constructor(
    readonly code:
      | "unknown_argument"
      | "retired_argument"
      | "missing_value"
      | "duplicate_argument",
    readonly argument: string,
  ) {
    super(code);
    this.name = "CliArgError";
  }
}

export function parseCliArgs(argv: readonly string[], spec: ArgSpec): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true, flags, values };
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (spec.retired?.includes(argument)) {
      throw new CliArgError("retired_argument", argument);
    }
    if (spec.flags?.includes(argument)) {
      if (flags.has(argument)) {
        throw new CliArgError("duplicate_argument", argument);
      }
      flags.add(argument);
      continue;
    }
    if (spec.values?.includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new CliArgError("missing_value", argument);
      }
      if (values.has(argument)) {
        throw new CliArgError("duplicate_argument", argument);
      }
      values.set(argument, value);
      index += 1;
      continue;
    }
    throw new CliArgError("unknown_argument", argument);
  }
  return { help: false, flags, values };
}

/** A positive finite number, or the documented default. */
export function positiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
