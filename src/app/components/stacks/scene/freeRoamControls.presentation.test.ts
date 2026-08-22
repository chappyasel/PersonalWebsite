import fs from "node:fs";
import { describe, expect, it } from "vitest";

const cameraRigSource = fs.readFileSync(
  new URL("./CameraRig.tsx", import.meta.url),
  "utf8",
);
const environmentSource = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);
const meadowSource = fs.readFileSync(
  new URL("./Meadow.tsx", import.meta.url),
  "utf8",
);
const diagnosticsSource = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const chromeSource = fs.readFileSync(
  new URL("../dom/ChromeLayer.tsx", import.meta.url),
  "utf8",
);
const placardSource = fs.readFileSync(
  new URL("../dom/PlacardLayer.tsx", import.meta.url),
  "utf8",
);

describe("free-roam controls", () => {
  it("uses Q/E for height, Shift for one-third speed, and damped mouse look", () => {
    expect(cameraRigSource).toContain('Number(keys.has("KeyE"))');
    expect(cameraRigSource).toContain('Number(keys.has("KeyQ"))');
    expect(cameraRigSource).toContain("? 1 / 3 : 1");
    expect(cameraRigSource).toContain("FREE_ROAM_LOOK_LAMBDA");
    expect(cameraRigSource).toContain("freeRoamTargetEuler");
  });

  it("keeps fog available in diagnostics while F owns the camera toggle", () => {
    expect(cameraRigSource).not.toContain(
      "freeRoamDiagnosticsController.toggleFog()",
    );
    expect(diagnosticsSource).toContain(
      "freeRoamDiagnosticsController.setFogEnabled(",
    );
    expect(environmentSource).toContain(
      "!freeRoam.enabled || freeRoam.fogEnabled",
    );
    expect(meadowSource).toContain("uniform float uFogEnabled;");
    expect(meadowSource).toContain(
      "freeRoam.enabled && !freeRoam.fogEnabled ? 0 : 1",
    );
    expect(chromeSource).toContain('event.key.toLowerCase() !== "f"');
    expect(chromeSource).toContain("freeRoamDiagnosticsController.toggle()");
    expect(chromeSource).toContain(
      "freeRoamDiagnosticsController.startFromCurrentPose()",
    );
    expect(chromeSource).toContain("canvas?.requestPointerLock()");
    expect(cameraRigSource).toContain("freeRoam.startFromCurrentPose");
  });

  it("restores and persists free roam only in development", () => {
    expect(chromeSource).toContain('process.env.NODE_ENV !== "development"');
    expect(chromeSource).toContain('browserStorage("localStorage")');
    expect(chromeSource).toContain("readFreeRoamEnabled(storage)");
    expect(chromeSource).toContain("writeFreeRoamEnabled(");
    expect(cameraRigSource).toContain("readFreeRoamPose(");
    expect(cameraRigSource).toContain("writeFreeRoamPose(");
  });

  it("hides the mobile sheet on entry and lets H toggle it", () => {
    expect(chromeSource).toContain("setStacksSheetDismissed(true)");
    expect(placardSource).toContain("setDismissed={setStacksSheetDismissed}");
    expect(placardSource).not.toContain(
      "const [mobileDismissed, setMobileDismissed] = useState(false)",
    );
  });
});
