import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import "server-only";

import { hashPassword, verifyPassword } from "./security";
import { env } from "~/env";

type Parameter = string | number | null;
type Row = Record<string, unknown>;
const directory = path.join(process.cwd(), "data/personalities");
const globalDatabase = globalThis as typeof globalThis & {
  personalityDatabase?: DatabaseSync;
};

let cachedPassword: { value: string; hash: string } | undefined;
export function passwordHash() {
  const standard = env.DAD_CONTENT_PASSWORD;
  if (!standard)
    throw new Error("The standard site password is not configured.");
  if (cachedPassword?.value === standard) return cachedPassword.hash;
  const filename = path.join(directory, "password-hash.txt");
  let hash = "";
  try {
    hash = readFileSync(filename, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!verifyPassword(standard, hash)) {
    hash = hashPassword(standard);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(filename, hash, { mode: 0o600 });
    chmodSync(filename, 0o600);
  }
  cachedPassword = { value: standard, hash };
  return hash;
}

function connection() {
  if (process.env.NODE_ENV !== "development")
    throw new Error("The personality database is local-only.");
  if (!globalDatabase.personalityDatabase) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const filename = path.join(directory, "library.sqlite");
    const sqlite = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    sqlite.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    const initialized = sqlite.prepare("PRAGMA user_version").get();
    if (initialized?.user_version === 0) {
      sqlite.exec("BEGIN");
      try {
        sqlite.exec(
          readFileSync(
            path.join(process.cwd(), "src/lib/personalities/server/schema.sql"),
            "utf8",
          ),
        );
        sqlite.exec("PRAGMA user_version=1; COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
    globalDatabase.personalityDatabase = sqlite;
  }
  return globalDatabase.personalityDatabase;
}

class Statement {
  constructor(
    private sql: string,
    private values: Parameter[] = [],
  ) {}
  bind(...values: Parameter[]) {
    return new Statement(this.sql, values);
  }
  first<T = Row>(): Promise<T | null> {
    return Promise.resolve(
      (connection()
        .prepare(this.sql)
        .get(...this.values) as T | undefined) ?? null,
    );
  }
  all(): Promise<{ results: Row[] }> {
    return Promise.resolve({
      results: connection()
        .prepare(this.sql)
        .all(...this.values),
    });
  }
  run() {
    connection()
      .prepare(this.sql)
      .run(...this.values);
    return Promise.resolve();
  }
}

const database = {
  prepare(sql: string) {
    return new Statement(sql);
  },
  async batch(statements: Statement[]) {
    const sqlite = connection();
    sqlite.exec("BEGIN");
    try {
      for (const statement of statements) await statement.run();
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
export function db() {
  return database;
}
