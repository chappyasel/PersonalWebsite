// Import a private JSON plan through the same authenticated API as the app.
// Usage: node scripts/import-personalities.mjs PRIVATE_PLAN_PATH LOCAL_URL
import { readFileSync } from "node:fs";

import { standardPassword } from "./personalities-password.mjs";

const [planPath, origin = "http://localhost:3016"] = process.argv.slice(2);
if (!planPath) throw new Error("Provide a private import plan path.");
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
  throw new Error("Import target must be localhost.");
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const password = standardPassword();
let cookie = "";
async function call(path, data) {
  const r = await fetch(origin + "/api/personalities/" + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Personality-Request": "1",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  });
  const v = await r.json();
  if (!r.ok)
    throw new Error(`${path}: ${r.status} ${v.error ?? "Request failed"}`);
  if (path === "login") cookie = r.headers.get("set-cookie").split(";")[0];
  return v;
}
await call("login", { password });
let assessments = 0;
let persons = 0;
for (const p of plan.people) {
  const person = await call("people", {
    name: p.name,
    group: p.group,
    importKey: p.importKey,
  });
  persons++;
  for (const a of p.assessments) {
    try {
      await call("assessments", { ...a, personId: person.id });
      assessments++;
    } catch (e) {
      if (!String(e.message).includes("409")) throw e;
    }
  }
}
await call("logout", {});
console.log(
  `Imported ${persons} people and ${assessments} assessment records.`,
);
