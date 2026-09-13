import postgres from "postgres";

type Parameter = string | number | boolean | null;
type Row = Record<string, unknown>;
type Executor = Pick<postgres.Sql, "unsafe">;

class Statement {
  constructor(
    private client: Executor,
    private sql: string,
    private values: Parameter[] = [],
  ) {}
  bind(...values: Parameter[]) {
    return new Statement(this.client, this.sql, values);
  }
  async first<T = Row>(): Promise<T | null> {
    const rows = await this.client.unsafe(this.sql, this.values);
    return (rows[0] as T | undefined) ?? null;
  }
  async all(): Promise<{ results: Row[] }> {
    return { results: await this.client.unsafe(this.sql, this.values) };
  }
  async run(client = this.client) {
    await client.unsafe(this.sql, this.values);
  }
}

// Queries are static SQL; values always travel as Postgres bind parameters.
export function createDatabase(url: string) {
  const client = postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return {
    prepare(sql: string) {
      return new Statement(client, sql);
    },
    async batch(statements: Statement[]) {
      await client.begin(async (transaction) => {
        for (const statement of statements) await statement.run(transaction);
      });
    },
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}
