import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all four Projects capture specs preserve approved trophy facets, including legacy absent flags", async () => {
  const specs = JSON.parse(
    await readFile("scripts/room-artwork-quality/capture-specs.json", "utf8"),
  );
  for (const label of [
    "light-desktop",
    "dark-desktop",
    "light-phone",
    "dark-phone",
  ])
    assert.equal(
      specs.cases[`projects/${label}`].owners.find((o) => o.id === "trophy")
        .treatment,
      "trophy",
      label,
    );
});
