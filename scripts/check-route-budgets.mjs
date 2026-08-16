import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const routes = [
  {
    name: "homepage",
    manifest: ".next/server/app/page_client-reference-manifest.js",
    budget: 250 * 1024,
  },
  {
    name: "books",
    manifest: ".next/server/app/books/page_client-reference-manifest.js",
    budget: 350 * 1024,
  },
];

let failed = false;
for (const route of routes) {
  const manifest = readFileSync(route.manifest, "utf8");
  const chunks = [
    ...new Set(
      [...manifest.matchAll(/static\/chunks\/[a-z0-9-]+\.js/g)].map(
        (match) => match[0],
      ),
    ),
  ];
  const gzipBytes = chunks.reduce((total, chunk) => {
    const source = readFileSync(`.next/${chunk}`);
    return total + gzipSync(source).byteLength;
  }, 0);

  const usedKb = (gzipBytes / 1024).toFixed(1);
  const budgetKb = (route.budget / 1024).toFixed(0);
  console.log(`${route.name}: ${usedKb} KB gzip / ${budgetKb} KB`);
  if (gzipBytes > route.budget) failed = true;
}

if (failed) process.exitCode = 1;
