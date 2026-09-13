// Runs real-Postgres API tests in an automatically removed local test database.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

const name = `personalities_test_${randomBytes(6).toString("hex")}`;
const admin = postgres("postgresql://127.0.0.1/postgres", {
  max: 1,
  onnotice: () => {},
});
try {
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "src/lib/personalities/server/postgres.test.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PERSONALITIES_TEST_DATABASE_URL: `postgresql://127.0.0.1/${name}`,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
