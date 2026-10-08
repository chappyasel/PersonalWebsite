import { describe, expect, it } from "vitest";

import { CliArgError, parseCliArgs, positiveNumber } from "./cli-args";

const spec = {
  flags: ["--dry-run", "--headless"] as const,
  values: ["--wait", "--deadline"] as const,
  retired: ["--timeout", "--no-headed", "--then-ingest"] as const,
  usage: "usage text",
};

function parse(argv: string[]) {
  return parseCliArgs(argv, spec);
}

describe("parseCliArgs", () => {
  it("reads flags and values", () => {
    const parsed = parse(["--dry-run", "--wait", "20"]);
    expect(parsed.help).toBe(false);
    expect([...parsed.flags]).toEqual(["--dry-run"]);
    expect(parsed.values.get("--wait")).toBe("20");
  });

  it("answers --help before anything else, even beside bad arguments", () => {
    for (const argv of [["--help"], ["-h"], ["--nonsense", "--help"], ["--help", "--timeout", "5"]]) {
      expect(parse(argv).help, argv.join(" ")).toBe(true);
    }
  });

  it("refuses an argument it does not know", () => {
    expect(() => parse(["--headed"])).toThrow(CliArgError);
    expect(() => parse(["--headed"])).toThrow("unknown_argument");
    expect(() => parse(["extra"])).toThrow("unknown_argument");
  });

  it("refuses a flag that was retired rather than ignoring it", () => {
    // The old entry points took these; silently dropping one would turn a
    // headless script into a headed browser without saying so.
    for (const retired of spec.retired) {
      expect(() => parse([retired]), retired).toThrow("retired_argument");
      expect(() => parse([retired, "5"]), retired).toThrow("retired_argument");
    }
  });

  it("refuses an option with no value, or one that looks like a flag", () => {
    expect(() => parse(["--wait"])).toThrow("missing_value");
    expect(() => parse(["--wait", "--dry-run"])).toThrow("missing_value");
  });

  it("refuses the same argument twice", () => {
    expect(() => parse(["--dry-run", "--dry-run"])).toThrow("duplicate_argument");
    expect(() => parse(["--wait", "5", "--wait", "6"])).toThrow(
      "duplicate_argument",
    );
  });

  it("accepts nothing at all", () => {
    expect(parse([])).toEqual({
      help: false,
      flags: new Set(),
      values: new Map(),
    });
  });

  it("names the offending argument on the error", () => {
    try {
      parse(["--no-headed"]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CliArgError);
      expect((error as CliArgError).argument).toBe("--no-headed");
      expect((error as CliArgError).code).toBe("retired_argument");
    }
  });
});

describe("positiveNumber", () => {
  it("takes a positive finite value", () => {
    expect(positiveNumber("20", 360)).toBe(20);
    expect(positiveNumber("0.5", 360)).toBe(0.5);
  });

  it("falls back on anything else", () => {
    for (const raw of [undefined, "", "0", "-1", "soon", "NaN", "Infinity"]) {
      expect(positiveNumber(raw, 360), String(raw)).toBe(360);
    }
  });
});
