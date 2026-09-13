import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const cases = JSON.parse(
  await readFile("scripts/generate/room-artwork-inputs/manifest.json", "utf8"),
).cases;
for (const c of cases) {
  for (const script of ["package", "apply-display-colors"])
    await new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [`scripts/room-artwork-quality/${script}.mjs`, c.unit, c.label],
        { stdio: "inherit" },
      );
      p.on("exit", (code) =>
        code ? reject(Error(`${c.unit}/${c.label} failed`)) : resolve(),
      );
    });
}
