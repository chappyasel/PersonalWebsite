import { spawn } from "node:child_process";
import { appendFile, open, readFile } from "node:fs/promises";

const cases = JSON.parse(
  await readFile("scripts/generate/room-artwork-inputs/manifest.json", "utf8"),
).cases;
const run = (file, args, log) =>
  new Promise(async (resolve, reject) => {
    const out = await open(log, "w");
    const p = spawn(process.execPath, [file, ...args], {
      stdio: ["ignore", out.fd, out.fd],
    });
    p.on("exit", async (code) => {
      await out.close();
      if (code) reject(Error(`${file} ${args.join(" ")} exit ${code}; ${log}`));
      else resolve();
    });
  });
for (const c of cases) {
  if (c.qualityReprocessing && !process.argv.includes("--force")) continue;
  const name = `${c.unit}-${c.label}`;
  await appendFile(
    "docs/reviews/room-artwork-quality-progress.md",
    `\nCapturing ${name}; log /tmp/room-artwork-quality-${name}.log\n`,
  );
  const cached = await readFile(
    `/tmp/room-artwork-quality-captures/${c.unit}/${c.label}/capture.json`,
    "utf8",
  )
    .then(JSON.parse)
    .catch(() => null);
  if (!cached?.readback) {
    await run(
      "scripts/room-artwork-quality/capture.mjs",
      [c.unit, c.label],
      `/tmp/room-artwork-quality-${name}.log`,
    );
  } else console.log("REUSE_STRAIGHT_ALPHA", name);
  await run(
    "scripts/room-artwork-quality/package.mjs",
    [c.unit, c.label, "--input", "/tmp/room-artwork-quality-captures"],
    `/tmp/room-artwork-quality-${name}-package.log`,
  );
  console.log("PACKAGED", name);
}
await run(
  "scripts/generate/room-artwork.mjs",
  [],
  "/tmp/room-artwork-quality-generate.log",
);
console.log("BATCH_COMPLETE");
