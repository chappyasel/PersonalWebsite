// Mutating smoke test: run only against the disposable local database.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { standardPassword } from "./personalities-password.mjs";

const origin = "http://localhost:3016";
const password = standardPassword();
let cookie = "";
async function request(
  path,
  body,
  {
    method = body === undefined ? "GET" : "POST",
    auth = true,
    originHeader = origin,
  } = {},
) {
  return fetch(origin + "/api/personalities/" + path, {
    method,
    headers: {
      Origin: originHeader,
      "Content-Type": "application/json",
      "X-Personality-Request": "1",
      ...(auth && cookie ? { Cookie: cookie } : {}),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
for (const [path, method] of [
  ["data", "GET"],
  ["people", "POST"],
  ["assessments", "POST"],
  ["import-preview", "POST"],
  ["import-score", "POST"],
  ["assessments/unknown", "PATCH"],
  ["assessments/unknown", "DELETE"],
]) {
  const r = await request(path, method === "GET" ? undefined : {}, {
    method,
    auth: false,
  });
  assert.equal(r.status, 401, path);
  assert.ok(r.headers.get("cache-control").includes("no-store"));
}
assert.equal(
  (await request("login", { password }, { originHeader: "https://evil.test" }))
    .status,
  403,
);
assert.equal(
  (await request("login", { password: "synthetic-wrong-password" })).status,
  401,
);
const login = await request("login", { password });
assert.equal(login.status, 200);
const setCookie = login.headers.get("set-cookie");
assert.ok(
  setCookie.includes("HttpOnly") && setCookie.includes("SameSite=Strict"),
);
cookie = setCookie.split(";")[0];
assert.equal(
  (await request("import-preview", { code: "https://localhost/secret" }))
    .status,
  400,
);
const created = await request("people", {
  name: "API verification fixture",
  group: "Friends",
  importKey: "api-verification-fixture",
});
assert.ok(created.ok);
const personId = (await created.json()).id;
const input = {
  personId,
  source: "manual",
  testVersion: "ipip-120",
  scoreKind: "raw",
  scoreMax: 120,
  scores: {
    Openness: 60,
    Conscientiousness: 70,
    Extraversion: 80,
    Agreeableness: 90,
    Neuroticism: 50,
  },
  takenOn: "2020-02-29",
  notes: "Synthetic fixture",
};
assert.equal(
  (
    await request("assessments", {
      ...input,
      scores: { ...input.scores, Openness: 121 },
    })
  ).status,
  400,
);
assert.equal(
  (await request("assessments", { ...input, personId: "unknown-person" }))
    .status,
  404,
);
const saved = await request("assessments", input);
assert.equal(saved.status, 201);
const { id } = await saved.json();
assert.equal(
  (
    await request(
      "assessments/" + id,
      { takenOn: "2021-12", notes: "Changed" },
      { method: "PATCH" },
    )
  ).status,
  200,
);
const library = await (await request("data")).json();
assert.equal(
  library.people
    .find((p) => p.id === personId)
    .assessments.find((a) => a.id === id).takenOn,
  "2021-12",
);
assert.equal(
  (await request("assessments/" + id, {}, { method: "DELETE" })).status,
  200,
);
assert.equal(
  (await request("assessments/" + id, {}, { method: "DELETE" })).status,
  404,
);
assert.equal(
  (
    await request(
      "people",
      { name: "Blocked", group: "Friends" },
      { originHeader: "https://evil.test" },
    )
  ).status,
  403,
);
assert.equal((await request("logout", {})).status, 200);
assert.equal((await request("data")).status, 401);
console.log(
  "Authenticated creation, history updates, deletion, input checks, CSRF, and logout checks passed.",
);

const cleanup = new DatabaseSync("data/personalities/library.sqlite");
cleanup.exec(
  "PRAGMA foreign_keys=ON; DELETE FROM people WHERE import_key='api-verification-fixture'",
);
cleanup.close();
