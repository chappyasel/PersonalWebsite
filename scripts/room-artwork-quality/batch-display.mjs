import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile("scripts/generate/room-artwork-inputs/manifest.json"),
);
for (const c of manifest.cases) {
  // Restore the frozen unlit quality output before fitting a new correction.
  // Fitting the already corrected image would compound prior calibration.
  for (const script of ["package", "capture-display", "calibrate-display"])
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [`scripts/room-artwork-quality/${script}.mjs`, c.unit, c.label],
        { stdio: "inherit" },
      );
      child.on("exit", (code) =>
        code
          ? reject(Error(`${script} ${c.unit}/${c.label} failed`))
          : resolve(),
      );
    });
  console.log("CASE COMPLETE", c.unit, c.label);
}
