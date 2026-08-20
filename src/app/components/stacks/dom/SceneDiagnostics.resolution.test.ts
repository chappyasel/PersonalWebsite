import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);

describe("the quality panel's resolution readout", () => {
  // Pinning a step leaves the axis controller adapting underneath, so the
  // pinned step and `axes.resolutionStep` disagree exactly when someone is
  // watching to see whether their pin took effect. Reporting the controller's
  // number there made a working pin look broken: a window whose pixel budget
  // capped it at DPR 1.62 rendered at step 11 and the panel said "res 9/11".
  it("reports the step the frame was rendered at, not the axis state", () => {
    expect(source).toContain(
      "qualityControls.resolutionStep ?? runtime.axes.resolutionStep",
    );
  });

  // An unmarked number that ignores the control beside it reads as a broken
  // control, which is the whole failure this fixes.
  it("says when the step is pinned rather than adapting", () => {
    expect(source).toMatch(
      /qualityControls\.resolutionStep != null \? " pinned" : ""/,
    );
  });

  // Guards the specific regression: the bare axis read must not come back in
  // the headline. It is still correct inside the Auto option, which is
  // deliberately describing what the CONTROLLER would do.
  it("does not print the bare axis step in the headline", () => {
    const headline = source.slice(
      source.indexOf("<span>Quality</span>"),
      source.indexOf("no frame published yet"),
    );
    expect(headline).not.toMatch(/res \$\{runtime\.axes\.resolutionStep\}/);
  });
});
