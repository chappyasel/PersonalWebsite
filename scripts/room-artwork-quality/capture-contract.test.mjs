import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  STRAIGHT_ALPHA_READBACK,
  verifyQualityCapture,
} from "./capture-contract.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const bytes = Buffer.from('{\n  "unit": "projects",\n  "owners": []\n}\n');
const spec = { contractSha256: sha(bytes) };
const good = {
  readback: STRAIGHT_ALPHA_READBACK,
  scale: 4,
  contractSha256: sha(JSON.stringify(JSON.parse(bytes))),
};
test("direct packaging rejects old premultiplied capture and an unrelated provenance string", () => {
  assert.throws(
    () => verifyQualityCapture({ ...good, readback: undefined }, spec, bytes),
    /straight-alpha/,
  );
  assert.throws(
    () => verifyQualityCapture({ ...good, readback: "corrected" }, spec, bytes),
    /straight-alpha/,
  );
});
test("canonical captured contract must match exact frozen source bytes before packaging", () => {
  assert.doesNotThrow(() => verifyQualityCapture(good, spec, bytes));
  assert.throws(
    () =>
      verifyQualityCapture({ ...good, contractSha256: "wrong" }, spec, bytes),
    /identity mismatch/,
  );
  assert.throws(
    () => verifyQualityCapture(good, spec, Buffer.from("{}")),
    /Frozen capture contract changed/,
  );
});
