#!/usr/bin/env node
// Build the site once, serve it on a local port, and capture room OG cards
// from it: every card by default, or the ones named with `--unit <slug>`
// (repeatable). `pnpm generate:home-og:local` is this with `--unit about`.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ROOM_OG_SLUGS, roomOgCard } from "./room-og-config.mjs";
import { roomOgInputManifest } from "./room-og-inputs.mjs";
import {
  freeLocalPort,
  run,
  startProductionServer,
} from "./room-og-server.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const requested = process.argv.flatMap((arg, index) =>
  arg === "--unit" ? [String(process.argv[index + 1])] : [],
);
for (const slug of requested) roomOgCard(slug);
const cards = requested.length > 0 ? requested : [...ROOM_OG_SLUGS];

/** @param {string[]} slugs */
async function inputDigests(slugs) {
  const digests = await Promise.all(
    slugs.map(
      async (card) => (await roomOgInputManifest({ root, card })).digest,
    ),
  );
  return digests.join(",");
}

console.log(
  `Building the local production site for OG capture (${cards.join(", ")})...`,
);
const inputsBeforeBuild = await inputDigests(cards);
await run("pnpm", ["exec", "next", "build"], { cwd: root });
const inputsAfterBuild = await inputDigests(cards);
if (inputsAfterBuild !== inputsBeforeBuild) {
  throw new Error(
    "Room OG inputs changed during the production build. Run the generator again.",
  );
}

const server = await startProductionServer({
  root,
  port: await freeLocalPort(3319),
});
try {
  for (const card of cards) {
    await run(
      process.execPath,
      [
        "scripts/generate/room-og-scene.mjs",
        "--unit",
        card,
        "--url",
        server.url,
      ],
      { cwd: root },
    );
  }
} finally {
  await server.stop();
}
