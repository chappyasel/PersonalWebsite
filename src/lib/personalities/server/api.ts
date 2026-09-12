import { fetchBigFive } from "../bigfive";
import { type Assessment, type LibraryPerson } from "../data";
import {
  InputError,
  object,
  optionalText,
  takenOn,
  validateAssessment,
  validatePerson,
} from "../validation";
import "server-only";

import { isValidDadPassword } from "~/lib/dad/access";

import { personalitiesEnabled, requestOrigin } from "./config";
import { db } from "./database";
import {
  clientAddress,
  cookie,
  digest,
  passwordVersion,
  sessionToken,
  token,
} from "./security";
import { env } from "~/env";

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
      "INSERT INTO personality_rate_limits (key,count,expires_at) VALUES ($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN personality_rate_limits.expires_at<=$3 THEN 1 ELSE personality_rate_limits.count+1 END, expires_at=CASE WHEN personality_rate_limits.expires_at<=$4 THEN excluded.expires_at ELSE personality_rate_limits.expires_at END RETURNING count",
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
  const origin = requestOrigin(request);
  if (
    !origin ||
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
      "SELECT site_id FROM personality_sessions WHERE token_hash=$1 AND expires_at>$2 AND password_version=$3",
    )
    .bind(digest(value), Date.now(), passwordVersion(env.DAD_CONTENT_PASSWORD))
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
    .prepare("SELECT id FROM personality_people WHERE id=$1 AND site_id=$2")
    .bind(id, site)
    .first();
  if (!row) throw new HttpError(404, "Person not found.");
}
function assessment(row: Record<string, unknown>): Assessment {
  return {
    id: String(row.id),
    personId: String(row.person_id),
    takenOn: row.taken_on as string | null,
    dateEstimated: row.date_estimated === true,
    addedAt: String(row.added_at),
    source: String(row.source),
    externalResultId: row.external_result_id as string | null,
    sourceReference: row.source_reference as string | null,
    testVersion: String(row.test_version),
    scoreKind: row.score_kind as Assessment["scoreKind"],
    scoreMax: row.score_max as 100 | 120,
    scores: row.scores as Assessment["scores"],
    facets: row.facet_scores ? (row.facet_scores as Assessment["facets"]) : [],
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
        "SELECT a.id FROM personality_assessments a JOIN personality_people p ON p.id=a.person_id WHERE a.import_key=$1 AND p.site_id=$2",
      )
      .bind(a.importKey, site)
      .first<{ id: string }>();
    if (found) return found;
  }
  await db()
    .prepare(
      "INSERT INTO personality_assessments (id,person_id,taken_on,added_at,source,external_result_id,source_reference,test_version,score_kind,score_max,scores,facet_scores,notes,import_key,date_estimated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text::jsonb,$12::text::jsonb,$13,$14,$15)",
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
      a.dateEstimated === true,
    )
    .run();
  return { id };
}
export async function handle(request: Request) {
  try {
    if (!personalitiesEnabled()) return json({ error: "Not found." }, 404);
    if (!requestOrigin(request))
      return json({ error: "Request host could not be verified." }, 403);
    const path = new URL(request.url).pathname
      .replace("/api/personalities", "/api")
      .replace(/\/$/, "");
    const method = request.method;
    if (method !== "GET") csrf(request);
    if (path === "/api/login" && method === "POST") {
      const data = await body(request);
      const password = data.password;
      if (typeof password !== "string" || !password || password.length > 256)
        throw new InputError("Enter a valid password.");
      await limited("login-global", 100, 600);
      await limited("login-" + digest(clientAddress(request)), 10, 600);
      if (!isValidDadPassword(password, env.DAD_CONTENT_PASSWORD))
        throw new HttpError(401, "Incorrect password.");
      const now = Date.now();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO personality_sites (id,created_at) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING",
          )
          .bind(SITE, new Date().toISOString()),
        db()
          .prepare("DELETE FROM personality_sessions WHERE expires_at<=$1")
          .bind(now),
        db()
          .prepare("DELETE FROM personality_rate_limits WHERE expires_at<=$1")
          .bind(now),
      ]);
      const value = token();
      await db()
        .prepare(
          "INSERT INTO personality_sessions (token_hash,site_id,expires_at,password_version) VALUES ($1,$2,$3,$4)",
        )
        .bind(
          digest(value),
          SITE,
          now + SESSION_SECONDS * 1000,
          passwordVersion(env.DAD_CONTENT_PASSWORD),
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
        .prepare("DELETE FROM personality_sessions WHERE token_hash=$1")
        .bind(digest(value))
        .run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
    }
    if (path === "/api/data" && method === "GET") {
      const [persons, results] = await Promise.all([
        db()
          .prepare(
            "SELECT id,name,group_name,created_at FROM personality_people WHERE site_id=$1 ORDER BY CASE group_name WHEN 'You' THEN 0 ELSE 1 END,name",
          )
          .bind(site)
          .all(),
        db()
          .prepare(
            "SELECT a.* FROM personality_assessments a JOIN personality_people p ON p.id=a.person_id WHERE p.site_id=$1 ORDER BY a.taken_on DESC NULLS LAST,a.added_at DESC,a.id",
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
          .prepare(
            "SELECT id FROM personality_people WHERE site_id=$1 AND import_key=$2",
          )
          .bind(site, p.importKey)
          .first();
        if (found) return json(found);
      }
      const id = crypto.randomUUID();
      await db()
        .prepare(
          "INSERT INTO personality_people (id,site_id,name,group_name,created_at,import_key) VALUES ($1,$2,$3,$4,$5,$6)",
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
          "SELECT a.id,a.date_estimated FROM personality_assessments a JOIN personality_people p ON p.id=a.person_id WHERE a.id=$1 AND p.site_id=$2",
        )
        .bind(id, site)
        .first();
      if (!existing) throw new HttpError(404, "Assessment not found.");
      if (method === "DELETE")
        await db()
          .prepare("DELETE FROM personality_assessments WHERE id=$1")
          .bind(id)
          .run();
      else {
        const d = await body(request);
        if (
          d.dateEstimated !== undefined &&
          typeof d.dateEstimated !== "boolean"
        )
          throw new InputError("Invalid date estimate flag.");
        await db()
          .prepare(
            "UPDATE personality_assessments SET taken_on=$1,notes=$2,date_estimated=$3 WHERE id=$4",
          )
          .bind(
            takenOn(d.takenOn),
            optionalText(d.notes, 4000) ?? "",
            d.dateEstimated ?? existing.date_estimated === true,
            id,
          )
          .run();
      }
      return json({ ok: true });
    }
    throw new HttpError(404, "Not found.");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof InputError) return json({ error: error.message }, 400);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      return json(
        {
          error:
            "That assessment code has already been saved. Check the existing history.",
        },
        409,
      );
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,40}$/.test(error.code)
        ? error.code
        : "UNKNOWN";
    console.error("Personalities request failed", { code });
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
