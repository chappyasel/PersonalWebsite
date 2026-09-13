import crypto from "node:crypto";
import { Matrix4 } from "three";

/**
 * @typedef {{path: string, sha256: string}} CaptureSource
 * @typedef {{
 *   unit: string,
 *   sourceRevision: string,
 *   rawCapture: CaptureSource,
 *   owners: {id: string, meshCount: number, poseSha256: string}[],
 *   liveRotations: {owner: string, name: string, rotation: number[]}[],
 *   liveRotationProvenance?: {
 *     sourceRevision: string,
 *     rawCapture: CaptureSource,
 *     owner: string,
 *     sourceField: string,
 *     localMatrices: number[][]
 *   }
 * }} ClockCapture
 */

const OWNER = "egg-clock-alarm";
const HAND = "room-boot:clock-second-hand";
const SOURCE_FIELD = "parts[id=egg-clock-alarm].localMatrices";

/**
 * Validate the saved clock pose against both archived hand meshes before
 * packaging. ClockFace is an untransformed sibling of SecondHand; the
 * archived hand has radius 0.0816 and pivot z 0.0016 in eggs.tsx/UnitSystems.tsx.
 * @param {ClockCapture} capture
 */
export function verifyCapturedClockRotation(capture) {
  if (capture.unit !== "systems") return;
  const evidence = capture.liveRotationProvenance;
  if (
    !evidence ||
    evidence.owner !== OWNER ||
    evidence.sourceField !== SOURCE_FIELD ||
    evidence.sourceRevision !== capture.sourceRevision ||
    evidence.rawCapture.path !== capture.rawCapture.path ||
    evidence.rawCapture.sha256 !== capture.rawCapture.sha256
  )
    throw new Error("Missing or mismatched archived clock provenance");

  const owner = capture.owners.find(({ id }) => id === OWNER);
  const matrices = evidence.localMatrices;
  if (
    owner?.meshCount !== 4 ||
    matrices.length !== 4 ||
    matrices.some(
      (matrix) => matrix.length !== 16 || !matrix.every(Number.isFinite),
    )
  )
    throw new Error("Invalid archived clock matrices");
  const pose = crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        matrices.map((matrix) =>
          matrix.map((value) => Number(value.toFixed(6))),
        ),
      ),
    )
    .digest("hex");
  if (pose !== owner.poseSha256)
    throw new Error("Archived clock matrices differ from the approved pose");

  const entries = capture.liveRotations.filter(
    ({ owner, name }) => owner === OWNER && name === HAND,
  );
  const rotation = entries[0]?.rotation;
  const angle = rotation?.[2];
  const dialMatrix = matrices[1];
  if (
    entries.length !== 1 ||
    rotation?.length !== 3 ||
    typeof angle !== "number" ||
    !dialMatrix ||
    !rotation.every(Number.isFinite) ||
    rotation[0] !== 0 ||
    rotation[1] !== 0
  )
    throw new Error("Missing or invalid captured clock rotation");

  const dial = new Matrix4().fromArray(dialMatrix);
  for (const [index, y] of [0.0816 * 0.31, -0.0816 * 0.12].entries()) {
    const reconstructed = dial
      .clone()
      .multiply(new Matrix4().makeTranslation(0, 0, 0.0016))
      .multiply(new Matrix4().makeRotationZ(angle))
      .multiply(new Matrix4().makeTranslation(0, y, 0));
    const archived = matrices[index + 2];
    if (
      !archived ||
      reconstructed.elements.some((value, element) => {
        const expected = archived[element];
        return (
          expected === undefined ||
          Number(value.toFixed(6)) !== Number(expected.toFixed(6))
        );
      })
    )
      throw new Error(`Captured clock rotation misses archived hand ${index}`);
  }
}
