import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  DAD_SEARCH_INDEX_FILENAME,
  buildDadSearchDocuments,
} from "./dad-index";

export async function writeDadSearchIndexArtifact(projectRoot: string) {
  const documents = await buildDadSearchDocuments(
    join(projectRoot, "content", "dad"),
  );
  await writeFile(
    join(projectRoot, "content", DAD_SEARCH_INDEX_FILENAME),
    `${JSON.stringify(documents)}\n`,
    "utf8",
  );
  return documents.length;
}
