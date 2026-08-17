import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const audioDirectory = path.resolve(process.cwd(), "public/audio/stacks");

describe("locally hosted scene audio", () => {
  it("keeps the complete recorded Ogg pack below 1.5 MB", () => {
    const files = fs
      .readdirSync(audioDirectory)
      .filter((file) => file.endsWith(".ogg"))
      .sort();
    expect(files).toEqual([
      "flagstick.ogg",
      "golf-cup.ogg",
      "golf-strike-b.ogg",
      "golf-strike-c.ogg",
      "golf-strike-d.ogg",
      "golf-strike.ogg",
      "golf-turf.ogg",
      "golf-win.ogg",
      "spring-birds-meadow.ogg",
      "wind-meadow-a.ogg",
      "wind-meadow-b.ogg",
    ]);
    const bytes = files.reduce(
      (sum, file) => sum + fs.statSync(path.join(audioDirectory, file)).size,
      0,
    );
    expect(bytes).toBeLessThan(1_500_000);
    for (const file of files)
      expect(
        fs.readFileSync(path.join(audioDirectory, file)).subarray(0, 4),
      ).toEqual(Buffer.from("OggS"));
  });
});
