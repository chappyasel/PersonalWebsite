import { createHash } from "node:crypto";

export const STRAIGHT_ALPHA_READBACK =
  "bottom-up premultiplied RGBA explicitly unpremultiplied before Canvas ImageData (archive capture.ts contract)";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** The capture recorded canonical JSON; the frozen spec records exact source file bytes. */
export function verifyQualityCapture(capture, spec, contractBytes) {
  if (capture.readback !== STRAIGHT_ALPHA_READBACK)
    throw Error("Capture lacks corrected straight-alpha readback provenance");
  if (sha(contractBytes) !== spec.contractSha256)
    throw Error("Frozen capture contract changed");
  const canonical = sha(JSON.stringify(JSON.parse(contractBytes)));
  if (capture.contractSha256 !== canonical)
    throw Error("Quality capture contract identity mismatch");
  if (capture.scale !== 4) throw Error("Expected4x quality source capture");
}
