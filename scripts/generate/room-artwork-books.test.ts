import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { verifyCapturedBooksIdentity } from "./room-artwork-books.mjs";
import { sha256 } from "./room-artwork.mjs";

type BooksCapture = Parameters<typeof verifyCapturedBooksIdentity>[0] & {
  owners: unknown;
  probes: unknown;
};

const root = "scripts/generate/room-artwork-inputs";
const previousHash =
  "56d8b48a2065491894ec97743dfa0805ea05d150e25f8aa01f03fd67b39155b3";
const currentHash =
  "c807357cd5747214133e272183e6a81be6e441d52ceb0b4a572938eaca68594f";
const approved = [
  {
    label: "light-desktop",
    svg: "49e751d8811926a115934d67132f83abef40bdab874f9dc1eded781c05b3d263",
    owners: "f61f03f3cd2b8f01f456f4d00b3e786950cf724c69fbaa42c780a7957241e0d2",
  },
  {
    label: "dark-desktop",
    svg: "f03e870ad3c86304ad8dfebd7f5b3ddb89e38587035fd8c86ba714408149fb87",
    owners: "ae3cc1461455fc73e2ae52a1e33f3cb5c80a80eb6057db3bda1f3e740beb0948",
  },
  {
    label: "light-phone",
    svg: "bced1794ecc37a9e918a478324a0f28dcfcfbf4043b79a1f7b0669b256394ddf",
    owners: "ae3cc1461455fc73e2ae52a1e33f3cb5c80a80eb6057db3bda1f3e740beb0948",
  },
  {
    label: "dark-phone",
    svg: "7cf1b0fba2a737deaa595738459148876cc3249a353b0223f42ee6382df312d7",
    owners: "ae3cc1461455fc73e2ae52a1e33f3cb5c80a80eb6057db3bda1f3e740beb0948",
  },
];

function input(label = "light-desktop") {
  return JSON.parse(
    readFileSync(`${root}/books/${label}/capture.json`, "utf8"),
  ) as BooksCapture;
}
const read = (file: string) => readFile(`${root}/${file}`);

describe("Books identity migration provenance", () => {
  it.each(approved)(
    "verifies $label with its original drawing, mesh identities, poses and probes",
    async ({ label, svg, owners }) => {
      const capture = input(label);
      expect(capture.requiresDataIdentity).toBe(true);
      expect(capture.capturedDataSha256).toBe(currentHash);
      expect(capture.dataIdentity?.previous.capturedDataSha256).toBe(
        previousHash,
      );
      await expect(
        verifyCapturedBooksIdentity(capture, read),
      ).resolves.toBeUndefined();
      expect(sha256(JSON.stringify(capture.owners))).toBe(owners);
      expect(sha256(JSON.stringify(capture.probes))).toBe(
        "3648e3c1a6fd63153959fa20c554a412f0662024828911e6df39b2a72f1f8a46",
      );
      expect(
        sha256(readFileSync(`public/images/stacks/boot/books/${label}.svg`)),
      ).toBe(svg);
    },
  );

  it("rejects changed preimage bytes instead of accepting a newly calculated original hash", async () => {
    const capture = input();
    await expect(
      verifyCapturedBooksIdentity(capture, async (file) =>
        Buffer.concat([await read(file), Buffer.from("\n")]),
      ),
    ).rejects.toThrow("preimage differs from the approved version 1 identity");
  });

  it("rejects a changed version 2 expected identity", async () => {
    const capture = input();
    capture.capturedDataSha256 = "0".repeat(64);
    await expect(verifyCapturedBooksIdentity(capture, read)).rejects.toThrow(
      "version 2 identity differs from the approved content",
    );
  });

  it("rejects migration metadata that does not retain the original expected hash", async () => {
    const capture = input();
    capture.dataIdentity!.previous.capturedDataSha256 = "0".repeat(64);
    await expect(verifyCapturedBooksIdentity(capture, read)).rejects.toThrow(
      "mismatched Books identity migration provenance",
    );
  });

  it("refuses to turn off Books data validation", async () => {
    const capture = input();
    capture.requiresDataIdentity = false;
    await expect(verifyCapturedBooksIdentity(capture, read)).rejects.toThrow(
      "mismatched Books identity migration provenance",
    );
  });
});
