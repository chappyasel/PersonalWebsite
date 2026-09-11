import { fetchBigFive } from "../bigfive";
import { type Assessment, type LibraryPerson } from "../data";
import {
  InputError,
  object,
  optionalText,
  takenOn,
  text,
  validateAssessment,
  validatePerson,
} from "../validation";
import "server-only";

import { db, passwordHash } from "./database";
import {
  cookie,
  digest,
  sessionToken,
  token,
  verifyPassword,
} from "./security";

const SITE = "private";
const SESSION_SECONDS = 60 * 60 * 24;
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extra,
    },
  });
}
async function limited(key: string, max: number, seconds: number) {
  const now = Date.now();
  const result = await db()
    .prepare(
      "INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
    )
    .bind(key, now + seconds * 1000, now, now)
    .first<{ count: number }>();
  if (!result || result.count > max)
    throw new HttpError(
      429,
      "Too many attempts. Please wait before trying again.",
    );
}
function csrf(request: Request) {
  const configured = process.env.PERSONALITIES_ORIGIN;
  const origin =
    configured ??
    `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`;
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("x-personality-request") !== "1" ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new HttpError(403, "Request origin could not be verified.");
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    throw new HttpError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Missing request.");
  let size = 0,
    result = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    result += decoder.decode(value, { stream: true });
  }
  try {
    return object(JSON.parse(result + decoder.decode()));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("Invalid JSON.");
  }
}
async function requireSession(request: Request) {
  const value = sessionToken(request);
  if (!value) throw new HttpError(401, "Unlock the library to continue.");
  const session = await db()
    .prepare(
      "SELECT site_id FROM sessions WHERE token_hash=? AND expires_at>? AND password_version=?",
    )
    .bind(digest(value), Date.now(), digest(passwordHash()))
    .first<{ site_id: string }>();
  if (session?.site_id !== SITE)
    throw new HttpError(
      401,
      "Your session has expired. Unlock the library again.",
    );
  return session.site_id;
}
async function personInSite(id: string, site: string) {
  const row = await db()
    .prepare("SELECT id FROM people WHERE id=? AND site_id=?")
    .bind(id, site)
    .first();
  if (!row) throw new HttpError(404, "Person not found.");
}
function assessment(row: Record<string, unknown>): Assessment {
  return {
    id: String(row.id),
    personId: String(row.person_id),
    takenOn: row.taken_on as string | null,
    addedAt: String(row.added_at),
    source: String(row.source),
    externalResultId: row.external_result_id as string | null,
    sourceReference: row.source_reference as string | null,
    testVersion: String(row.test_version),
    scoreKind: row.score_kind as Assessment["scoreKind"],
    scoreMax: row.score_max as 100 | 120,
    scores: JSON.parse(String(row.scores)) as Assessment["scores"],
    facets: row.facet_scores
      ? (JSON.parse(row.facet_scores as string) as Assessment["facets"])
      : [],
    notes: String(row.notes),
  };
}
async function saveAssessment(input: unknown, site: string) {
  const a = validateAssessment(input);
  await personInSite(a.personId, site);
  const id = crypto.randomUUID();
  if (a.importKey) {
    const found = await db()
      .prepare(
        "SELECT a.id FROM assessments a JOIN people p ON p.id=a.person_id WHERE a.import_key=? AND p.site_id=?",
      )
      .bind(a.importKey, site)
      .first<{ id: string }>();
    if (found) return found;
  }
  await db()
    .prepare(
      "INSERT INTO assessments (id,person_id,taken_on,added_at,source,external_result_id,source_reference,test_version,score_kind,score_max,scores,facet_scores,notes,import_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      a.personId,
      a.takenOn,
      new Date().toISOString(),
      a.source,
      a.externalResultId,
      a.sourceReference,
      a.testVersion,
      a.scoreKind,
      a.scoreMax,
      JSON.stringify(a.scores),
      JSON.stringify(a.facets),
      a.notes,
      a.importKey ?? null,
    )
    .run();
  return { id };
}
export async function handle(request: Request) {
  try {
    if (process.env.NODE_ENV !== "development")
      return json({ error: "Not found." }, 404);
    const hostname = new URL(
      `http://${request.headers.get("host") ?? new URL(request.url).host}`,
    ).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname))
      return json({ error: "Local access only." }, 403);
    const path = new URL(request.url).pathname
      .replace("/api/personalities", "/api")
      .replace(/\/$/, "");
    const method = request.method;
    if (method !== "GET") csrf(request);
    if (path === "/api/login" && method === "POST") {
      const data = await body(request);
      const password = text(data.password, "password", 200);
      await limited("login-global", 100, 600);
      await limited(
        "login-" + digest(request.headers.get("cf-connecting-ip") ?? "local"),
        10,
        600,
      );
      if (!verifyPassword(password, passwordHash()))
        throw new HttpError(401, "Incorrect password.");
      const now = Date.now();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO private_sites (id,password_hash,created_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash",
          )
          .bind(SITE, passwordHash(), new Date().toISOString()),
        db().prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now),
        db().prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
      ]);
      const value = token();
      await db()
        .prepare(
          "INSERT INTO sessions (token_hash,site_id,expires_at,password_version) VALUES (?,?,?,?)",
        )
        .bind(
          digest(value),
          SITE,
          now + SESSION_SECONDS * 1000,
          digest(passwordHash()),
        )
        .run();
      return json({ ok: true }, 200, {
        "Set-Cookie": cookie(request, value, SESSION_SECONDS),
      });
    }
    const site = await requireSession(request);
    if (path === "/api/logout" && method === "POST") {
      const value = sessionToken(request)!;
      await db()
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(digest(value))
        .run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
    }
    if (path === "/api/data" && method === "GET") {
      const [persons, results] = await Promise.all([
        db()
          .prepare(
            "SELECT id,name,group_name,created_at FROM people WHERE site_id=? ORDER BY CASE group_name WHEN 'You' THEN 0 ELSE 1 END,name",
          )
          .bind(site)
          .all(),
        db()
          .prepare(
            "SELECT a.* FROM assessments a JOIN people p ON p.id=a.person_id WHERE p.site_id=? ORDER BY a.taken_on DESC,a.added_at DESC",
          )
          .bind(site)
          .all(),
      ]);
      const people: LibraryPerson[] = persons.results.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        group: p.group_name as LibraryPerson["group"],
        createdAt: String(p.created_at),
        assessments: results.results
          .filter((a) => a.person_id === p.id)
          .map(assessment),
      }));
      return json({ people });
    }
    if (path === "/api/people" && method === "POST") {
      const p = validatePerson(await body(request));
      if (p.importKey) {
        const found = await db()
          .prepare("SELECT id FROM people WHERE site_id=? AND import_key=?")
          .bind(site, p.importKey)
          .first();
        if (found) return json(found);
      }
      const id = crypto.randomUUID();
      await db()
        .prepare(
          "INSERT INTO people (id,site_id,name,group_name,created_at,import_key) VALUES (?,?,?,?,?,?)",
        )
        .bind(id, site, p.name, p.group, new Date().toISOString(), p.importKey)
        .run();
      return json({ id }, 201);
    }
    if (path === "/api/assessments" && method === "POST")
      return json(await saveAssessment(await body(request), site), 201);
    if (
      (path === "/api/import-preview" || path === "/api/import-score") &&
      method === "POST"
    ) {
      await limited("import-" + site, 30, 60);
      const data = await body(request);
      const result = await fetchBigFive(data.code);
      if (path === "/api/import-preview") return json(result);
      return json(
        await saveAssessment({ ...result, personId: data.personId }, site),
        201,
      );
    }
    const match = /^\/api\/assessments\/([a-zA-Z0-9-]+)$/.exec(path);
    if (match && (method === "PATCH" || method === "DELETE")) {
      const id = match[1]!;
      const existing = await db()
        .prepare(
          "SELECT a.id FROM assessments a JOIN people p ON p.id=a.person_id WHERE a.id=? AND p.site_id=?",
        )
        .bind(id, site)
        .first();
      if (!existing) throw new HttpError(404, "Assessment not found.");
      if (method === "DELETE")
        await db().prepare("DELETE FROM assessments WHERE id=?").bind(id).run();
      else {
        const d = await body(request);
        await db()
          .prepare("UPDATE assessments SET taken_on=?,notes=? WHERE id=?")
          .bind(takenOn(d.takenOn), optionalText(d.notes, 4000) ?? "", id)
          .run();
      }
      return json({ ok: true });
    }
    throw new HttpError(404, "Not found.");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof InputError) return json({ error: error.message }, 400);
    if (error instanceof Error && error.message.includes("UNIQUE constraint"))
      return json(
        {
          error:
            "That assessment code has already been saved. Check the existing history.",
        },
        409,
      );
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
