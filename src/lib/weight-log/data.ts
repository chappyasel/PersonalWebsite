import "server-only";

import { db } from "~/server/db";

import { loadWeightLogRecords } from "./database";
import { buildWeightLog } from "./records";

/** Load the public chart from the Weight Log tables, on the server only. */
export async function getWeightLog() {
  return buildWeightLog(await loadWeightLogRecords(db));
}
