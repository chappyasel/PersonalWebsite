// Explicit metadata-only import. Requires successful saved-camera pixel evidence.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { Matrix4 } from "three";

const root = "scripts/generate/room-artwork-inputs";
const evidence = "docs/reviews/production-artwork-metadata-recovery";
const json = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const manifest = await json(`${root}/manifest.json`);
for (const label of ["dark-desktop", "light-phone", "dark-phone"]) {
  const result = await json(`${evidence}/projects-${label}.comparison.json`);
  if (
    !result.compatible ||
    !result.exactSavedCamera ||
    result.maxCssResidualUpperBound !== 0
  )
    throw Error(`Unproven Projects metadata: ${label}`);
  const raw = await json(`${evidence}/projects-${label}.metadata.json`);
  const input = `projects/${label}/capture.json`;
  const contract = await json(`${root}/${input}`);
  const shelf = raw.parts.find((p) => p.id === "shelf");
  contract.unitWorld = new Matrix4()
    .fromArray(JSON.parse(raw.readiness.poseSignature)[0])
    .multiply(new Matrix4().fromArray(shelf.localMatrices[0]).invert())
    .toArray();
  contract.registrationAvailable = true;
  contract.registrationUnavailableReason = null;
  contract.probes = [];
  contract.owners = [];
  for (const part of raw.parts) {
    const paths = raw.coverage
      .filter((c) => c.disposition === "included" && c.owner === part.id)
      .map((c) => c.path);
    const inv = raw.inventory.filter((i) => i.owner === part.id);
    if (paths.length !== part.meshCount || inv.length !== part.meshCount)
      throw Error("Recovered inventory mismatch");
    contract.owners.push({
      id: part.id,
      parentOwner: part.parentOwner,
      meshCount: part.meshCount,
      paths,
      geometryIdentitySha256: hash(
        JSON.stringify(
          inv.map((v, i) => ({
            path: paths[i],
            node: v.node,
            type: v.geometry,
          })),
        ),
      ),
      poseSha256: hash(
        JSON.stringify(
          part.localMatrices.map((m) => m.map((v) => Number(v.toFixed(6)))),
        ),
      ),
    });
    if (part.id === "shelf") {
      for (const [n, coordinates] of [
        [0, [0, 1, 0]],
        [1, [1, 1, 0]],
        [2, [0, 1, 1]],
        [3, [1, 1, 1]],
      ])
        contract.probes.push({
          id: `shelf-top-${n}`,
          path: paths[0],
          owner: part.id,
          geometryType: inv[0].geometry,
          localMatrix: part.localMatrices[0],
          sample: { kind: "bounds", coordinates },
        });
    } else if (contract.probes.filter((p) => p.owner !== "shelf").length < 5) {
      const i = Math.max(
        0,
        inv.findIndex(
          (v) =>
            v.geometry === "PlaneGeometry" || v.geometry === "ShapeGeometry",
        ),
      );
      contract.probes.push({
        id: part.id,
        path: paths[i],
        owner: part.id,
        geometryType: inv[i].geometry,
        localMatrix: part.localMatrices[i],
        sample: { kind: "point", coordinates: [0, 0, 0] },
      });
    }
  }
  contract.recovery = {
    metadata: `${evidence}/projects-${label}.metadata.json`,
    metadataSha256: hash(
      await fs.readFile(`${evidence}/projects-${label}.metadata.json`),
    ),
    comparison: `${evidence}/projects-${label}.comparison.json`,
    comparisonSha256: hash(
      await fs.readFile(`${evidence}/projects-${label}.comparison.json`),
    ),
    maxCssResidualUpperBound: 0,
    method:
      "New mounted metadata under the exact saved camera, all retained masks pixel-identical to the approved source capture.",
  };
  await fs.writeFile(`${root}/${input}`, JSON.stringify(contract) + "\n");
}
const books = await json(`${evidence}/books-light-desktop.comparison.json`);
if (
  !books.compatible ||
  !books.colourComparisons?.length ||
  books.colourComparisons.some((c) => c.changedChannels !== 0)
)
  throw Error("Books cover pixels are not proven identical");
const identity = await json(`${evidence}/books-data-identity.json`);
// Same canonical projection as the exported serializeRoomBooksArtworkIdentity helper.
identity.featuredBookColors = Object.fromEntries(
  Object.entries(identity.featuredBookColors).sort(([a], [b]) =>
    a.localeCompare(b),
  ),
);
identity.spineBooks = identity.spineBooks.map((b) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  pageCount: b.pageCount,
  audioLengthMin: b.audioLengthMin,
  edgeColor: b.edgeColor,
}));
const dataHash = hash(JSON.stringify(identity));
const baseline = await json(`${root}/books/light-desktop/capture.json`);
for (const label of [
  "light-desktop",
  "dark-desktop",
  "light-phone",
  "dark-phone",
]) {
  const input = `books/${label}/capture.json`;
  const c = await json(`${root}/${input}`);
  const poses = c.owners.map((o) => [o.id, o.poseSha256]).sort();
  if (
    JSON.stringify(poses) !==
    JSON.stringify(baseline.owners.map((o) => [o.id, o.poseSha256]).sort())
  )
    throw Error("Books case data/poses differ");
  c.capturedDataSha256 = dataHash;
  c.dataIdentity = {
    encoding: "SHA-256 of serializeRoomBooksArtworkIdentity(data), UTF-8",
    verifiedBy: `${evidence}/books-light-desktop.comparison.json`,
    scope:
      "Current mounted data is associated with the approved snapshot by identical retained geometry masks and all 13 owner colour buffers in light desktop. Other cases share exact owner pose hashes; their theme/viewport artwork is unchanged.",
    textureContentLimitation:
      "Data digest includes cover URLs, not remote response bytes. Runtime must still require decoded cover textures and valid mounted geometry.",
  };
  await fs.writeFile(`${root}/${input}`, JSON.stringify(c) + "\n");
}
for (const entry of manifest.cases)
  entry.captureSha256 = hash(
    await fs.readFile(`${root}/${entry.inputCapture}`),
  );
await fs.writeFile(
  `${root}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Imported three exact Projects recoveries and Books data identity",
  dataHash,
);
