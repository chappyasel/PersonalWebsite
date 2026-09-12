import {
  applyPersonalitySchema,
  importLibrary,
} from "../../../../scripts/lib/personality-migration";
import { fetchBigFive } from "../bigfive";
import type { Library } from "../data";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { handle } from "./api";
import { digest } from "./security";
import { createDatabase } from "./store";

const state = vi.hoisted(() => ({
  password: "synthetic-test-password",
  store: undefined as ReturnType<typeof createDatabase> | undefined,
}));
vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    get DAD_CONTENT_PASSWORD() {
      return state.password;
    },
  },
}));
vi.mock("./database", () => ({ db: () => state.store! }));
vi.mock("../bigfive", () => ({ fetchBigFive: vi.fn() }));

const url = process.env.PERSONALITIES_TEST_DATABASE_URL;
const origin = "https://personality-test.example";
let sql: postgres.Sql;
let session = "";
const scores = {
  Openness: 60,
  Conscientiousness: 70,
  Extraversion: 80,
  Agreeableness: 90,
  Neuroticism: 50,
};
const assessment = {
  source: "manual",
  testVersion: "ipip-120",
  scoreKind: "raw" as const,
  scoreMax: 120 as const,
  scores,
  takenOn: "2025-08",
  dateEstimated: true,
  notes: "Synthetic fixture",
};

async function request(
  path: string,
  body?: unknown,
  options: {
    method?: string;
    auth?: boolean;
    headers?: Record<string, string>;
    url?: string;
  } = {},
) {
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  return handle(
    new Request((options.url ?? origin) + "/api/personalities/" + path, {
      method,
      headers: {
        Host: new URL(origin).host,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Personality-Request": "1",
        "x-vercel-forwarded-for": "192.0.2.1",
        ...(session && options.auth !== false ? { Cookie: session } : {}),
        ...options.headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function login() {
  const response = await request("login", { password: state.password });
  expect(response.status).toBe(200);
  session = response.headers.get("set-cookie")!.split(";")[0]!;
  return response;
}
async function addPerson() {
  const response = await request("people", {
    name: "Synthetic person",
    group: "Friends",
    importKey: "fixture-person",
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

// This suite only runs against the disposable database created by the script.
describe.skipIf(!url)("personality API with real Postgres", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      target.hostname !== "127.0.0.1" ||
      !/^\/personalities_test_[a-f0-9]+$/.test(target.pathname)
    )
      throw new Error("Use the disposable local test runner.");
    sql = postgres(url!, { max: 2, onnotice: () => undefined });
    state.store = createDatabase(url!);
    await applyPersonalitySchema(sql);
    await applyPersonalitySchema(sql);
  });
  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PERSONALITIES_ORIGIN", origin);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    session = "";
    state.password = "synthetic-test-password";
    await sql`TRUNCATE personality_sessions, personality_rate_limits, personality_assessments, personality_people, personality_sites`;
  });
  afterAll(async () => {
    await state.store?.close();
    await sql?.end();
    vi.unstubAllEnvs();
  });

  it("protects every data and mutation endpoint before authentication", async () => {
    for (const [path, method] of [
      ["data", "GET"],
      ["people", "POST"],
      ["assessments", "POST"],
      ["import-preview", "POST"],
      ["import-score", "POST"],
      ["assessments/unknown", "PATCH"],
      ["assessments/unknown", "DELETE"],
    ]) {
      const response = await request(path!, method === "GET" ? undefined : {}, {
        method,
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("issues HTTPS host-only cookies, persists sessions across connections, and revokes logout", async () => {
    const response = await login();
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-personality_session=");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"])
      expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Domain=");
    const rows = await sql`SELECT * FROM personality_sessions`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(digest(session.split("=")[1]!));
    await state.store!.close();
    state.store = createDatabase(url!);
    expect((await request("data")).status).toBe(200);
    expect((await request("logout", {})).status).toBe(200);
    expect((await request("data")).status).toBe(401);
  });

  it("rejects wrong passwords, expires sessions, and invalidates them on password rotation", async () => {
    expect((await request("login", { password: "wrong" })).status).toBe(401);
    await login();
    await sql`UPDATE personality_sessions SET expires_at = 1`;
    expect((await request("data")).status).toBe(401);
    await login();
    state.password = "changed-synthetic-password";
    expect((await request("data")).status).toBe(401);
    await login();
    expect((await request("data")).status).toBe(200);
  });

  it("requires the configured origin and fails closed on previews or missing configuration", async () => {
    expect(
      (
        await request(
          "login",
          { password: state.password },
          { headers: { Origin: "https://evil.example" } },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "login",
          { password: state.password },
          {
            headers: {
              Host: "evil.example",
              "x-forwarded-host": new URL(origin).host,
            },
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "login",
          { password: state.password },
          { headers: { "X-Personality-Request": "" } },
        )
      ).status,
    ).toBe(403);
    // A trusted deployment may see HTTP internally; configured HTTPS still
    // requires Secure cookies and exact Origin/Host matches.
    const response = await request(
      "login",
      { password: state.password },
      { url: "http://internal:3000" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("; Secure");
    vi.stubEnv("PERSONALITIES_ORIGIN", "");
    expect((await request("data")).status).toBe(404);
    vi.stubEnv("PERSONALITIES_ORIGIN", "http://personality-test.example");
    expect((await request("data")).status).toBe(404);
    vi.stubEnv("PERSONALITIES_ORIGIN", origin);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await request("data")).status).toBe(404);
  });

  it("atomically limits concurrent attempts and ignores spoofed non-Vercel IP headers", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        request(
          "login",
          { password: "wrong" },
          {
            headers: {
              "cf-connecting-ip": `192.0.2.${i + 20}`,
              "x-forwarded-for": `192.0.2.${i + 20}`,
            },
          },
        ),
      ),
    );
    expect(attempts.filter((r) => r.status === 401)).toHaveLength(10);
    expect(attempts.filter((r) => r.status === 429)).toHaveLength(1);
    expect(
      (
        await request(
          "login",
          { password: state.password },
          { headers: { "x-vercel-forwarded-for": "192.0.2.2" } },
        )
      ).status,
    ).toBe(200);
    await sql`UPDATE personality_rate_limits SET expires_at = 1`;
    expect((await request("login", { password: state.password })).status).toBe(
      200,
    );
  });

  it("preserves raw scores, JSON facets, date precision, and estimate flags through CRUD", async () => {
    await login();
    const personId = await addPerson();
    expect(
      (
        await request("assessments", {
          ...assessment,
          personId,
          scores: { ...scores, Openness: 121 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("assessments", { ...assessment, personId: "missing" }))
        .status,
    ).toBe(404);
    const saved = await request("assessments", { ...assessment, personId });
    expect(saved.status).toBe(201);
    const { id } = (await saved.json()) as { id: string };
    let library = (await (await request("data")).json()) as Library;
    expect(library.people[0]!.assessments[0]).toMatchObject({
      ...assessment,
      id,
      personId,
      facets: [],
    });
    expect(
      (
        await request(
          `assessments/${id}`,
          { takenOn: "2025-08-08", notes: "Changed" },
          { method: "PATCH" },
        )
      ).status,
    ).toBe(200);
    library = (await (await request("data")).json()) as Library;
    expect(library.people[0]!.assessments[0]).toMatchObject({
      takenOn: "2025-08-08",
      dateEstimated: true,
    });
    expect(
      (
        await request(
          `assessments/${id}`,
          { takenOn: null, dateEstimated: false },
          { method: "PATCH" },
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(`assessments/${id}`, {}, { method: "DELETE" })).status,
    ).toBe(200);
    expect(
      (await request(`assessments/${id}`, {}, { method: "DELETE" })).status,
    ).toBe(404);
  });

  it("imports code previews and rejects duplicate external results", async () => {
    await login();
    const personId = await addPerson();
    const imported = {
      ...assessment,
      personId,
      source: "bigfive-test.com",
      externalResultId: "000000000000000000000001",
      sourceReference: null,
      facets: [
        { trait: "Openness" as const, name: "Imagination", score: 12, max: 20 },
      ],
      notes: "",
    };
    vi.mocked(fetchBigFive).mockResolvedValue(imported);
    const preview = await request("import-preview", {
      code: imported.externalResultId,
    });
    expect(preview.status).toBe(200);
    expect(
      (
        await request("import-score", {
          code: imported.externalResultId,
          personId,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("import-score", {
          code: imported.externalResultId,
          personId,
        })
      ).status,
    ).toBe(409);
    expect(await sql`SELECT id FROM personality_assessments`).toHaveLength(1);
    const library = (await (await request("data")).json()) as Library;
    expect(library.people[0]!.assessments[0]!.facets).toEqual(imported.facets);
  });

  it("returns dated assessments newest first and undated results last", async () => {
    await login();
    const personId = await addPerson();
    for (const takenOn of [null, "2025-08", "2026-01-01"]) {
      expect(
        (await request("assessments", { ...assessment, personId, takenOn }))
          .status,
      ).toBe(201);
    }
    const library = (await (await request("data")).json()) as Library;
    expect(
      library.people[0]!.assessments.map((record) => record.takenOn),
    ).toEqual(["2026-01-01", "2025-08", null]);
  });

  it("rolls back a failed batch without leaving partial rows", async () => {
    const store = state.store!;
    await expect(
      store.batch([
        store
          .prepare(
            "INSERT INTO personality_sites (id,created_at) VALUES ($1,$2)",
          )
          .bind("rollback", "2025-01-01"),
        store
          .prepare(
            "INSERT INTO personality_people (id,site_id,name,group_name,created_at) VALUES ($1,$2,$3,$4,$5)",
          )
          .bind("bad", "missing-site", "Fixture", "Friends", "2025-01-01"),
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    expect(await sql`SELECT * FROM personality_sites`).toHaveLength(0);
  });

  it("repeats imports exactly and rolls back conflicting imports", async () => {
    const library = {
      personality_sites: [{ id: "private", created_at: "2025-01-01" }],
      personality_people: [
        {
          id: "one",
          site_id: "private",
          name: "Fixture",
          group_name: "Family",
          created_at: "2025-01-01",
          import_key: null,
        },
      ],
      personality_assessments: [
        {
          id: "one-test",
          person_id: "one",
          taken_on: "2025-08",
          date_estimated: true,
          added_at: "2025-09-01",
          source: "manual",
          external_result_id: null,
          source_reference: null,
          test_version: "ipip-120",
          score_kind: "raw",
          score_max: 120,
          scores,
          facet_scores: [],
          notes: "Fixture",
          import_key: null,
        },
      ],
    };
    await importLibrary(sql, library);
    await importLibrary(sql, library);
    expect(await sql`SELECT id FROM personality_people`).toHaveLength(1);
    const conflicting = structuredClone(library);
    conflicting.personality_sites.push({
      id: "rolled-back",
      created_at: "2025-01-01",
    });
    conflicting.personality_people[0]!.name = "Changed";
    await expect(importLibrary(sql, conflicting)).rejects.toThrow(
      "Verification failed",
    );
    expect(
      await sql`SELECT id FROM personality_sites WHERE id = 'rolled-back'`,
    ).toHaveLength(0);
    expect((await sql`SELECT name FROM personality_people`)[0]!.name).toBe(
      "Fixture",
    );
  });
});
