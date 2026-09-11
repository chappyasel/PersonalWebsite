import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pacificWorkoutDate } from "./exportTimeZone";

// Opt-in PostgreSQL checks. Only SELECTs and transaction-local settings;
// no application tables are read or written.
describe.skipIf(!process.env.WEIGHTLIFTING_TEST_DATABASE_URL)(
  "Pacific workout dates",
  () => {
    let client: ReturnType<typeof postgres>;
    beforeAll(() => {
      client = postgres(process.env.WEIGHTLIFTING_TEST_DATABASE_URL!, {
        max: 1,
      });
    });
    afterAll(async () => {
      await client.end();
    });

    it.each([
      ["2019-07-01 20:10", "2019-07-01 17:10"],
      ["2023-01-31 07:58", "2023-01-31 04:58"],
      ["2019-01-01 01:30", "2018-12-31 22:30"],
      ["2024-03-10 03:30", "2024-03-09 23:30"],
      ["2024-11-03 03:30", "2024-11-03 01:30"],
    ])(
      "converts Eastern %s to Pacific %s, including DST and date boundaries",
      async (input, expected) => {
        const [row] = await drizzle(client).execute<{ date: string }>(sql`
      SELECT to_char(${pacificWorkoutDate(input, "America/New_York")} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS date
    `);
        expect(row?.date).toBe(expected);
      },
    );

    it.each(["UTC", "America/Los_Angeles", "America/New_York"])(
      "preserves Pacific exports with the database session in %s",
      async (zone) => {
        await drizzle(client).transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('TimeZone', ${zone}, true)`);
          const [row] = await tx.execute<{ date: string }>(sql`
        SELECT to_char(${pacificWorkoutDate("2019-07-01 17:10", "America/Los_Angeles")} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS date
      `);
          expect(row?.date).toBe("2019-07-01 17:10");
        });
      },
    );
  },
);
