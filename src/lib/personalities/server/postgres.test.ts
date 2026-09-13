import {
  applyPersonalitySchema,
  importLibrary,
} from "../../../../scripts/lib/personality-migration";
import { fetchBigFive } from "../bigfive";
import type { Library } from "../data";
import type { SharedSnapshot } from "../sharing";
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
import { getSharePreview } from "./share-preview";
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
    await sql`TRUNCATE personality_shares, personality_sessions, personality_rate_limits, personality_assessments, personality_people, personality_sites`;
  });
  afterAll(async () => {
    await state.store?.close();
    await sql?.end();
    vi.unstubAllEnvs();
  });

  it("protects every data and mutation endpoint before authentication", async () => {
    for (const [path, method] of [
      ["data", "GET"],
      ["shares", "GET"],
      ["shares", "POST"],
      ["shares/unknown", "DELETE"],
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

  it("shares only selected fields, freezes snapshots, and revokes capability access", async () => {
    await login();
    const personId = await addPerson();
    const created = await request("assessments", {
      ...assessment,
      personId,
      sourceReference: "private-source",
      externalResultId: "private-code",
    });
    const { id } = (await created.json()) as { id: string };
    await request("assessments", {
      ...assessment,
      personId,
      takenOn: "2024-01",
      notes: "UNSELECTED",
    });
    const response = await request("shares", {
      results: [{ assessmentId: id, label: "Friend A" }],
      includeDates: false,
      expiresInDays: 30,
      notes: "NEVER SHARE",
    });
    expect(response.status).toBe(201);
    const share = (await response.json()) as {
      id: string;
      url: string;
      snapshot: unknown;
    };
    expect(new URL(share.url).pathname).toBe(
      `/personalities/shared/${share.id}`,
    );
    const previewHeaders = new Headers({ host: new URL(origin).host });
    expect((await getSharePreview(share.id, previewHeaders))?.snapshot).toEqual(
      share.snapshot,
    );
    expect(
      await getSharePreview(share.id, new Headers({ host: "wrong.example" })),
    ).toBeNull();
    expect(await getSharePreview("unknown", previewHeaders)).toBeNull();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await getSharePreview(share.id, previewHeaders)).toBeNull();
    vi.stubEnv("VERCEL_ENV", "production");
    const bearer = new URL(share.url).hash.slice(1);
    const headers = { Authorization: `Bearer ${bearer}` };
    const read = await request("shared", undefined, { auth: false, headers });
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toContain("no-store");
    expect(read.headers.get("set-cookie")).toBeNull();
    const data = (await read.json()) as { snapshot: unknown };
    expect(data.snapshot).toEqual({
      version: 1,
      results: [
        {
          label: "Friend A",
          takenOn: null,
          dateEstimated: false,
          testVersion: "ipip-120",
          scoreKind: "raw",
          scoreMax: 120,
          scores,
        },
      ],
    });
    const stored =
      await sql`SELECT token_hash,snapshot FROM personality_shares WHERE id=${share.id}`;
    expect(stored[0]!.token_hash).toBe(digest(bearer));
    expect(JSON.stringify(stored)).not.toContain(bearer);
    for (const path of ["data", "shares"])
      expect(
        (await request(path, undefined, { auth: false, headers })).status,
      ).toBe(401);
    expect((await request("shares", {}, { auth: false, headers })).status).toBe(
      401,
    );
    expect(
      (
        await request(
          `assessments/${id}`,
          {},
          { method: "DELETE", auth: false, headers },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          `shares/${share.id}`,
          {},
          { method: "DELETE", auth: false, headers },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request("shared", undefined, {
          auth: false,
          headers: { Authorization: `Bearer ${bearer.slice(0, -1)}!` },
        })
      ).status,
    ).toBe(404);
    expect((await request("shared", undefined, { auth: false })).status).toBe(
      404,
    );
    await request(`assessments/${id}`, {}, { method: "DELETE" });
    expect(
      (
        (await (
          await request("shared", undefined, { auth: false, headers })
        ).json()) as { snapshot: SharedSnapshot }
      ).snapshot,
    ).toEqual(data.snapshot);
    expect(
      (await request(`shares/${share.id}`, {}, { method: "DELETE" })).status,
    ).toBe(200);
    expect(await getSharePreview(share.id, previewHeaders)).toBeNull();
    expect(
      (await request("shared", undefined, { auth: false, headers })).status,
    ).toBe(404);
  });

  it("freezes unnamed friend and family dots without identifiers or cross-trait profiles", async () => {
    await login();
    const personId = await addPerson();
    const { id } = (await (
      await request("assessments", { ...assessment, personId })
    ).json()) as { id: string };
    // Another result for the named person must never become an unnamed dot.
    await request("assessments", {
      ...assessment,
      personId,
      takenOn: "2026-01",
      scores: { ...scores, Openness: 119 },
    });
    for (const [group, openness, conscientiousness] of [
      ["Friends", 40, 100],
      ["Family", 100, 40],
      ["You", 120, 120],
    ] as const) {
      const created = await request("people", {
        name: `SECRET-${group}`,
        group,
      });
      const { id: otherId } = (await created.json()) as { id: string };
      await request("assessments", {
        ...assessment,
        personId: otherId,
        scores: {
          ...scores,
          Openness: openness,
          Conscientiousness: conscientiousness,
        },
        notes: "HIDDEN-NOTES",
      });
      await request("assessments", {
        ...assessment,
        personId: otherId,
        takenOn: "2024-01",
        scores: { ...scores, Openness: 24 },
      });
    }
    // Even a compatible friend in another site must not enter the snapshot.
    await sql`INSERT INTO personality_sites (id,created_at) VALUES ('other','2025-01-01')`;
    await sql`INSERT INTO personality_people (id,site_id,name,group_name,created_at) VALUES ('outsider','other','OUTSIDER','Friends','2025-01-01')`;
    await sql`INSERT INTO personality_assessments (id,person_id,added_at,source,test_version,score_kind,score_max,scores) VALUES ('outside-result','outsider','2026-01-01','manual','ipip-120','raw',120,${JSON.stringify(scores)}::text::jsonb)`;
    const input = {
      results: [{ assessmentId: id, label: "Named result" }],
      includeDates: false,
      expiresInDays: 30,
      includeAnonymous: true,
    };
    const response = await request("shares", input);
    expect(response.status).toBe(201);
    const share = (await response.json()) as {
      url: string;
      snapshot: SharedSnapshot;
    };
    expect(share.snapshot.anonymous).toEqual({
      count: 2,
      scores: {
        Openness: [40, 100],
        Conscientiousness: [40, 100],
        Extraversion: [80, 80],
        Agreeableness: [90, 90],
        Neuroticism: [50, 50],
      },
    });
    const headers = {
      Authorization: `Bearer ${new URL(share.url).hash.slice(1)}`,
    };
    const read = (await (
      await request("shared", undefined, { auth: false, headers })
    ).json()) as { snapshot: SharedSnapshot };
    expect(read.snapshot).toEqual(share.snapshot);
    expect(JSON.stringify(read)).not.toMatch(
      /SECRET|OUTSIDER|HIDDEN|personId|assessmentId|group/,
    );
    await sql`DELETE FROM personality_assessments WHERE person_id<>${personId}`;
    const frozen = (await (
      await request("shared", undefined, { auth: false, headers })
    ).json()) as { snapshot: SharedSnapshot };
    expect(frozen.snapshot).toEqual(share.snapshot);
    const disabled = (await (
      await request("shares", { ...input, includeAnonymous: false })
    ).json()) as { snapshot: SharedSnapshot };
    expect(disabled.snapshot.anonymous).toBeUndefined();
    expect(
      (await request("shares", { ...input, includeAnonymous: "yes" })).status,
    ).toBe(400);
  });

  it("validates subsets and expiry, requires CSRF, and keeps previews disabled", async () => {
    await login();
    const personId = await addPerson();
    const { id } = (await (
      await request("assessments", { ...assessment, personId })
    ).json()) as { id: string };
    const input = {
      results: [{ assessmentId: id, label: "Alias" }],
      includeDates: true,
      expiresInDays: 7,
    };
    for (const override of [
      { results: [] },
      { results: Array(7).fill(input.results[0]) },
      { results: [input.results[0], input.results[0]] },
      { expiresInDays: 1 },
      { includeDates: "yes" },
      { results: [{ assessmentId: id, label: "" }] },
    ]) {
      expect((await request("shares", { ...input, ...override })).status).toBe(
        400,
      );
    }
    await sql`INSERT INTO personality_sites (id,created_at) VALUES ('other','2025-01-01')`;
    await sql`INSERT INTO personality_people (id,site_id,name,group_name,created_at) VALUES ('other-person','other','Other','Friends','2025-01-01')`;
    await sql`UPDATE personality_assessments SET person_id='other-person' WHERE id=${id}`;
    expect((await request("shares", input)).status).toBe(404);
    await sql`UPDATE personality_assessments SET person_id=${personId} WHERE id=${id}`;
    expect(
      (
        await request("shares", input, {
          headers: { Origin: "https://wrong.example" },
        })
      ).status,
    ).toBe(403);
    const share = (await (await request("shares", input)).json()) as {
      id: string;
      url: string;
      snapshot: { results: { takenOn: string; dateEstimated: boolean }[] };
    };
    expect(share.snapshot.results[0]).toMatchObject({
      takenOn: assessment.takenOn,
      dateEstimated: true,
    });
    const headers = {
      Authorization: `Bearer ${new URL(share.url).hash.slice(1)}`,
    };
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(
      (await request("shared", undefined, { auth: false, headers })).status,
    ).toBe(404);
    vi.stubEnv("VERCEL_ENV", "production");
    await sql`UPDATE personality_shares SET expires_at=${Date.now() - 1} WHERE id=${share.id}`;
    expect(
      (await request("shared", undefined, { auth: false, headers })).status,
    ).toBe(404);
    expect(
      await getSharePreview(
        share.id,
        new Headers({ host: new URL(origin).host }),
      ),
    ).toBeNull();
    const forever = await request("shares", { ...input, expiresInDays: null });
    expect(forever.status).toBe(201);
    expect(
      ((await forever.json()) as { expiresAt: number | null }).expiresAt,
    ).toBeNull();
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
