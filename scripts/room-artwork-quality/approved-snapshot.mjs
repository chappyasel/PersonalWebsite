import { inlineDetails } from "../generate/room-artwork.mjs";
import { readFile } from "node:fs/promises";

/** Reconstruct the byte-identical approved drawing for historical identity tests. */
/** @param {string} unit @param {string} label */
export async function approvedSnapshot(unit, label) {
  const spec = JSON.parse(
    await readFile("scripts/room-artwork-quality/capture-specs.json", "utf8"),
  ).cases[`${unit}/${label}`];
  return inlineDetails(
    await readFile(spec.approvedSvg.file, "utf8"),
    spec.approvedDetails,
    (file) => readFile(`scripts/generate/room-artwork-inputs/${file}`),
  );
}
