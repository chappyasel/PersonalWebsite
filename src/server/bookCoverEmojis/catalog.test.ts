import { expect, it, vi } from "vitest";

import { readCloudCatalog } from "./catalog";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  end: vi.fn(),
  tx: vi.fn(),
  postgres: vi.fn(),
}));
vi.mock("postgres", () => ({ default: mocks.postgres }));

it("reads the catalog inside a read-only consistent transaction and closes the connection", async () => {
  mocks.postgres.mockReturnValue({ begin: mocks.begin, end: mocks.end });
  mocks.tx.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "book" }]);
  mocks.begin.mockImplementation(
    async (_mode: string, fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx),
  );
  expect(await readCloudCatalog("fake-test-url")).toEqual([{ id: "book" }]);
  expect(mocks.begin.mock.calls[0]?.[0]).toBe(
    "isolation level repeatable read read only",
  );
  const statements = mocks.tx.mock.calls.map((call) =>
    (call[0] as string[]).join(""),
  );
  expect(statements[0]).toContain("statement_timeout = '20s'");
  expect(statements[1]).toMatch(/SELECT[\s\S]*FROM books ORDER BY notion_id/);
  expect(statements.join("\n")).not.toMatch(
    /INSERT|UPDATE|DELETE|ALTER|CREATE/,
  );
  expect(mocks.end).toHaveBeenCalledWith({ timeout: 5 });
});
