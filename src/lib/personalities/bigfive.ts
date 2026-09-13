import { type Facet, type Scores, type Trait } from "./data";
import { InputError, resultCode, validateAssessment } from "./validation";

const domainMap: Record<string, Trait> = {
  O: "Openness",
  C: "Conscientiousness",
  E: "Extraversion",
  A: "Agreeableness",
  N: "Neuroticism",
};
// Decode data records only. Never evaluate the site's JavaScript or display its HTML.
export function parseBigFive(html: string, code: string) {
  const frames = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
  ]
    .map((m) => JSON.parse(m[1]!) as string)
    .join("");
  const records = new Map<string, unknown>();
  for (const line of frames.split("\n")) {
    const m = /^([\da-f]+):(.*)$/.exec(line);
    if (m) {
      try {
        records.set(m[1]!, JSON.parse(m[2]!));
      } catch {}
    }
  }
  const resolve = (v: unknown): unknown =>
    typeof v === "string" && /^\$[\da-f]+$/.test(v)
      ? records.get(v.slice(1))
      : v;
  const domains = new Map<string, Record<string, unknown>>();
  function visit(value: unknown, depth = 0) {
    if (depth > 40 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, depth + 1));
      return;
    }
    const d = value as Record<string, unknown>;
    if (
      typeof d.domain === "string" &&
      domainMap[d.domain] &&
      typeof d.score === "number"
    )
      domains.set(d.domain, d);
    Object.values(d).forEach((v) => visit(v, depth + 1));
  }
  records.forEach((v) => visit(v));
  if (domains.size !== 5)
    throw new InputError(
      "Could not read all five scores. Check the code, or enter the scores manually.",
    );
  const scores = {} as Scores;
  const facets: Facet[] = [];
  for (const [letter, d] of domains) {
    const trait = domainMap[letter]!;
    if (d.count !== 24)
      throw new InputError("This result uses an unsupported test version.");
    scores[trait] = d.score as number;
    const list = resolve(d.facets);
    if (!Array.isArray(list) || list.length !== 6)
      throw new InputError("Could not read the complete subtrait results.");
    let sum = 0;
    for (const v of list) {
      const f = resolve(v) as Record<string, unknown>;
      if (
        !f ||
        typeof f.title !== "string" ||
        typeof f.score !== "number" ||
        f.count !== 4 ||
        !Number.isInteger(f.score) ||
        f.score < 4 ||
        f.score > 20
      )
        throw new InputError("Invalid subtrait results.");
      facets.push({ trait, name: f.title, score: f.score, max: 20 });
      sum += f.score;
    }
    if (sum !== scores[trait])
      throw new InputError("Trait and subtrait scores do not match.");
  }
  const date = /"children":"(\d{1,2})\/(\d{1,2})\/(\d{4})"/.exec(frames);
  const takenOn = date
    ? `${date[3]}-${date[1]!.padStart(2, "0")}-${date[2]!.padStart(2, "0")}`
    : null;
  return validateAssessment({
    personId: "preview",
    takenOn,
    source: "bigfive-test.com",
    externalResultId: code,
    sourceReference: `https://bigfive-test.com/result/${code}`,
    testVersion: "ipip-120",
    scoreKind: "raw",
    scoreMax: 120,
    scores,
    facets,
    notes: "",
  });
}
export async function fetchBigFive(input: unknown) {
  const code = resultCode(input);
  const response = await fetch(`https://bigfive-test.com/result/${code}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "text/html" },
  });
  if (!response.ok)
    throw new InputError(
      "The result could not be retrieved. Check the code and try again.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new InputError("Empty result.");
  let html = "";
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new InputError("Result page is too large.");
    }
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return parseBigFive(html, code);
}
