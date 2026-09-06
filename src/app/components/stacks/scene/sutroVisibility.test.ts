import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sceneEnvironment = readFileSync(
  fileURLToPath(new URL("./SceneEnvironment.tsx", import.meta.url)),
  "utf8",
);

describe("Sutro Tower visibility", () => {
  it("hides the silhouette and warning lights in screenshot mode", () => {
    expect(sceneEnvironment).toContain(
      "const screenshot = useScreenshotMode()",
    );
    expect(sceneEnvironment).toContain(
      "u.uSutroVisible!.value = screenshot.enabled ? 0 : 1",
    );
    expect(sceneEnvironment).toContain("sutro *= uSutroVisible");
    expect(sceneEnvironment).toContain(
      "float sutroNight = night * uSutroVisible",
    );
  });
});
