// Private data commands. The destination is always explicit and never inferred
// from DATABASE_URL. No passwords, connection strings, rows, or codes are logged.
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

import {
  applyPersonalitySchema,
  importLibrary,
  personalityTables,
  readLegacyLibrary,
  verifyLibrary,
} from "./lib/personality-migration.ts";

config({
  path: [".env.development.local", ".env.local", ".env.development", ".env"],
  quiet: true,
});
const [command, ...args] = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const commands = ["schema", "import", "verify", "backup", "restore"];
if (!commands.includes(command)) {
  console.error(
    "Usage: pnpm personalities:db schema|import|verify|backup|restore [private-file] [--apply] [--allow-remote]",
  );
  process.exit(1);
}
let sql;
try {
  const target = process.env.PERSONALITIES_TARGET_DATABASE_URL;
  if (!target)
    throw new Error("Set PERSONALITIES_TARGET_DATABASE_URL explicitly.");
  const url = new URL(target);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Expected a Postgres destination.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && !args.includes("--allow-remote"))
    throw new Error(
      "Remote access requires --allow-remote and an explicitly approved destination.",
    );
  if (
    ["schema", "import", "restore"].includes(command) &&
    !args.includes("--apply")
  )
    throw new Error(
      "This command writes to the destination. Review it, then pass --apply.",
    );
  sql = postgres(target, { max: 1, prepare: false, onnotice: () => {} });
  if (command === "schema") {
    await applyPersonalitySchema(sql);
    console.log(
      "Personality tables are ready. Other application tables were not modified.",
    );
  } else if (command === "import" || command === "verify") {
    const library = readLegacyLibrary(
      positional[0] ?? "data/personalities/library.sqlite",
    );
    const counts = await (command === "import"
      ? importLibrary(sql, library)
      : verifyLibrary(sql, library));
    console.log(
      `${command === "import" ? "Imported and verified" : "Verified"} ${counts.personality_people} people and ${counts.personality_assessments} assessments, including every field. Sessions and credentials were not imported.`,
    );
  } else {
    const filename = path.resolve(
      positional[0] ??
        `data/personalities/backups/personality-${Date.now()}.dump`,
    );
    const privateRoot = path.resolve("data/personalities") + path.sep;
    if (!filename.startsWith(privateRoot))
      throw new Error(
        "Backups must stay under the gitignored data/personalities directory.",
      );
    const pgEnv = {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username) || process.env.USER,
      PGPASSWORD: decodeURIComponent(url.password),
    };
    const pgOptions = {
      sslmode: "PGSSLMODE",
      sslrootcert: "PGSSLROOTCERT",
      sslcert: "PGSSLCERT",
      sslkey: "PGSSLKEY",
      channel_binding: "PGCHANNELBINDING",
      connect_timeout: "PGCONNECT_TIMEOUT",
      options: "PGOPTIONS",
      application_name: "PGAPPNAME",
    };
    for (const [key, value] of url.searchParams) {
      if (!pgOptions[key])
        throw new Error(
          "Unsupported backup connection option. Use a direct Postgres connection URL.",
        );
      pgEnv[pgOptions[key]] = value;
    }
    if (command === "backup") {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      const previousMask = process.umask(0o077);
      try {
        const result = spawnSync(
          "pg_dump",
          [
            "--format=custom",
            "--exclude-table-data=public.personality_sessions",
            "--exclude-table-data=public.personality_rate_limits",
            "--no-owner",
            "--no-acl",
            ...personalityTables.map((table) => `--table=public.${table}`),
            "--file",
            filename,
          ],
          { env: pgEnv, stdio: ["ignore", "ignore", "pipe"] },
        );
        if (result.status !== 0)
          throw new Error(
            "pg_dump failed. Check the target and installed PostgreSQL tools.",
          );
        chmodSync(filename, 0o600);
      } finally {
        process.umask(previousMask);
      }
      console.log("Private personality backup saved.");
    } else {
      if (!positional[0])
        throw new Error("Provide the private backup file to restore.");
      for (const table of personalityTables) {
        const [found] =
          await sql`SELECT to_regclass(${`public.${table}`}) AS name`;
        if (found.name)
          throw new Error(
            "Restore requires a destination without personality tables. Existing tables will not be overwritten.",
          );
      }
      const dump = spawnSync(
        "pg_restore",
        ["--no-owner", "--no-acl", "--file=-", filename],
        { env: pgEnv, maxBuffer: 64 * 1024 * 1024 },
      );
      if (dump.status !== 0)
        throw new Error("Could not read the private backup.");
      const restored = spawnSync(
        "psql",
        ["-X", "--set=ON_ERROR_STOP=1", "--single-transaction"],
        {
          input: Buffer.concat([
            dump.stdout,
            Buffer.from(
              "\nDELETE FROM public.personality_sessions; DELETE FROM public.personality_rate_limits;\n",
            ),
          ]),
          env: pgEnv,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      if (restored.status !== 0)
        throw new Error("Restore failed and was rolled back.");
      // Restoring content must not resurrect logged-out sessions.
      console.log(
        "Personality backup restored. Sign in again with the standard password.",
      );
    }
  }
} catch (error) {
  // Driver errors may contain private rows in detail/query fields.
  console.error(
    error?.code
      ? `Database operation failed (${error.code}). No private values were logged.`
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await sql?.end({ timeout: 5 });
}
