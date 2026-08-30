import { SCENE_PHOTOS } from "../../sceneArtifacts";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { TRAINING_PINS } from "./trainingBoardLayout";

const source = fs.readFileSync(
  new URL("./UnitTraining.tsx", import.meta.url),
  "utf8",
);
const tubs = fs.readFileSync(
  new URL("./trainingTubs.tsx", import.meta.url),
  "utf8",
);
const boardLayout = fs.readFileSync(
  new URL("./trainingBoardLayout.ts", import.meta.url),
  "utf8",
);

describe("Training shelf prop destinations", () => {
  it("keeps the protein powder grabbable without opening Weightlifting", () => {
    // The tubs share one authored shell; its Grabbable carries no Portal, so
    // none of the three tubs can quietly become a route.
    expect(tubs).toContain('hoverKey="grab:protein"');
    const start = tubs.indexOf("function SupplementTub");
    const end = tubs.indexOf("</Grabbable>", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(tubs.slice(start, end)).not.toContain("to=");
    expect(source).toContain("<ProteinTub");
  });

  it("makes each board photo independently grabbable without waking the rest", () => {
    // PinnedPrint (the mount, photo and grab surface) sits just above
    // TrainingBoard, which pins one per Grabbable.
    const start = source.indexOf("function PinnedPrint");
    const end = source.indexOf("export default function UnitTraining", start);
    const board = source.slice(start, end);

    expect(board).toContain("TRAINING_PINS.map");
    expect(board).not.toContain("TRAINING_PINS.filter");
    expect(board).toContain("<TrainingFigureCards");
    expect(board).toContain("<Grabbable");
    expect(board).toContain("artifact={pin.id}");
    expect(board).not.toContain("href={href}");
    expect(board).not.toContain("portalLabel={href");
    expect(board).toContain("physicsDetachOffset={[0, 0, 0.08]}");
    expect(board).not.toContain("physicsAfterPull");
    expect(board).not.toContain("collisionMode");
    expect(board).not.toContain("fallbackRest");
    expect(board).toContain("grab-surface:");
    expect(board).toContain("raycast={() => null}");
    expect(board).toContain("physicsIgnore: true");
    expect(board).not.toContain("<PhotoMount");
  });

  it("uses one large portrait beside a three-column photo and figure grid", () => {
    expect(boardLayout).toContain("width: 0.36");
    expect(boardLayout.match(/width: 0\.17/g)).toHaveLength(3);
    expect(source).toContain("<TrainingFigureCards");
  });

  it("cuts every pinned print to its photo's own aspect, so nothing is cropped", () => {
    expect(TRAINING_PINS).toHaveLength(4);
    for (const pin of TRAINING_PINS) {
      const photo = SCENE_PHOTOS.find((entry) => entry.id === pin.id)!;
      expect(pin.src).toBe(photo.image);
      expect(pin.height / pin.width).toBeCloseTo(photo.height / photo.width, 6);
    }
  });

  it("keeps the three displaced board photos as loose top-shelf prints", () => {
    for (const id of [
      "training-gym-pose-v8",
      "training-deadlift-v8",
      "training-bench-v8",
    ]) {
      expect(source).toContain(`id="${id}"`);
    }
    expect(
      source.match(
        /src="\/images\/stacks\/v8\/training-(gym-pose|deadlift|bench)\.webp"/g,
      ),
    ).toHaveLength(3);
  });

  it("places Lift Table as a separate scene artifact", () => {
    const start = source.indexOf('hoverKey="artifact:lift-table"');
    const end = source.indexOf("</Grabbable>", start);
    const liftTable = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(liftTable).toContain('artifact="lift-table"');
    expect(liftTable).toContain(
      'src="/images/stacks/artifacts/lift-table.png"',
    );
    expect(liftTable).toContain("hoverTiltAngle={Math.PI / 3}");
    expect(liftTable).not.toContain("tiltOnHover={false}");
  });

  it("makes every ball on the shelves a golf-bay target", () => {
    // The basketball inline, the baseball and tennis ball through LooseBall,
    // the two golf balls through GolfBallProp. A ball without `hittable` is
    // one the club will never swing at.
    //
    // Two, not three: the soda cans were the third and they left for the
    // Systems shelf on 2026-08-29. `hittable` did not go with them — Systems
    // has no golf bay, so the registration would have had no reader.
    expect(source.match(/hittable=\{\{/g)).toHaveLength(2);
    expect(source).not.toContain("SODA_CAN");
    expect(source).toContain('hoverKey="grab:basketball"');
    expect(source).toContain("grab:ball:");
    expect(source.match(/id: "tennis", kind: "tennis"/g)).toHaveLength(1);
    expect(source.match(/id: "baseball", kind: "baseball"/g)).toHaveLength(1);
    expect(source).toContain("TRAINING_SHELF_GOLF_BALLS.map");
    expect(source.match(/id: "shelf-[ab]"/g)).toHaveLength(2);
    expect(source).toContain("<GolfBallProp");
  });

  it("splits the shelves: tubs up with one dumbbell, prints and the other dumbbell down", () => {
    const lowerStart = source.indexOf("lower={");
    const lowerEnd = source.indexOf("<group position={[-0.3,", lowerStart);
    const lower = source.slice(lowerStart, lowerEnd);
    const top = source.slice(lowerEnd);
    expect(lower).toContain('hoverKey="grab:dumbbell:training:left"');
    // The three prints hold the lower plank now. The pickleball group took
    // the can pyramid's slot when it went to Systems on 2026-08-29, so the
    // split this guards is prints-and-a-dumbbell down, tubs-and-a-dumbbell up.
    expect(lower).toContain("training-pickleball-group-v8");
    expect(lower).toContain("training-golf-group-v8");
    expect(lower).not.toContain("<ProteinTub");
    expect(lower).not.toContain("<GorillaModeTub");
    expect(top).toContain('hoverKey="grab:dumbbell:training:right"');
    expect(top).toContain("<ProteinTub");
    expect(top).toContain("<GorillaModeTub");
    expect(top).not.toContain("training-pickleball-group-v8");
  });
});
