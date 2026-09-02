import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const soundtrackPath = path.resolve(
  process.cwd(),
  "public/audio/vision-ride/synthwave-loop.ogg",
);

describe("Vision ride soundtrack", () => {
  it("is a separate lazy Ogg within its 350 KB budget", () => {
    const bytes = fs.readFileSync(soundtrackPath);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from("OggS"));
    expect(bytes.byteLength).toBeLessThanOrEqual(350_000);
    expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(
      "d4ad0b0b4f6f8eaeb40092886d3a8378d437ac7765fca3c2f78ed139f6ab27c3",
    );
  });

  it("keeps CC0 metadata outside the core ambience directory", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "public/audio/LICENSES.json"),
        "utf8",
      ),
    ) as { visionRide: Array<Record<string, string>> };
    expect(manifest.visionRide[0]).toMatchObject({
      title: "Synthwave Loop.wav",
      author: "furbyguy",
      license: "CC0 1.0",
      file: "/audio/vision-ride/synthwave-loop.ogg",
    });
    expect(
      fs.existsSync(
        path.resolve(process.cwd(), "public/audio/stacks/synthwave-loop.ogg"),
      ),
    ).toBe(false);
  });
});
