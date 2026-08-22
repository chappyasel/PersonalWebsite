/**
 * Find the newest Takeout zip in Google Drive (newer than --requested-at),
 * download it via Drive API, extract watch-history.json, place at canonical
 * path the sync script reads.
 *
 * Replaces the prior Playwright-based download flow, which Google's passkey
 * reauth gate makes impossible from headless contexts.
 *
 * Exit codes:
 *   0 = downloaded + extracted; downstream sync can run
 *   3 = no ready export yet (try again later)
 *   1 = auth failure (need to re-run drive-auth)
 *   2 = unexpected failure
 *
 * Args: --requested-at <ISO>
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getDrive } from "./drive";

const DATA_ROOT = path.join(os.homedir(), ".local/share/youtube-takeout");
const DOWNLOAD_DIR = path.join(DATA_ROOT, "incoming");
const FINAL_PATH = path.join(DATA_ROOT, "watch-history.json");

function parseArgs(): { requestedAt: Date } {
  const idx = process.argv.indexOf("--requested-at");
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error("--requested-at <ISO> is required");
  }
  return { requestedAt: new Date(process.argv[idx + 1]!) };
}

async function main() {
  const { requestedAt } = parseArgs();
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  let drive;
  try {
    drive = getDrive();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Find Takeout zips. Google delivers them to a "Takeout" folder in the user's
  // Drive as multiple files per export: "takeout-YYYYMMDDTHHMMSSZ-NNN.zip" and
  // "takeout-YYYYMMDDTHHMMSSZ-3-NNN.zip". The "-3-" file is the YouTube one
  // (different service IDs get different prefixes). Mime is "application/x-zip".
  const q =
    "name contains 'takeout-' and (mimeType = 'application/zip' or mimeType = 'application/x-zip-compressed' or mimeType = 'application/x-zip') and trashed = false";
  let resp;
  try {
    resp = await drive.files.list({
      q,
      orderBy: "createdTime desc",
      pageSize: 25,
      fields: "files(id, name, size, createdTime, md5Checksum)",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|unauthorized/i.test(msg)) {
      console.error(
        "Drive auth failed — refresh token may be revoked. Re-run `pnpm takeout:drive-auth`.",
      );
      process.exit(1);
    }
    console.error("Drive list failed:", msg);
    process.exit(2);
  }

  const files = resp.data.files ?? [];
  if (files.length === 0) {
    console.log("No Takeout zips in Drive yet.");
    process.exit(3);
  }

  // Pick fresh files (createdTime ≥ requested_at − 1h). Google has changed the
  // service archive number over time (-3- in June 2026, -2- in July 2026), so
  // do not depend on the filename to identify the YouTube zip. Download fresh
  // candidates newest-first and keep the one that actually contains
  // watch-history.json.
  const marginMs = 60 * 60_000;
  const cutoff = new Date(requestedAt.getTime() - marginMs);
  const fresh = files.filter(
    (f) => f.createdTime && new Date(f.createdTime) >= cutoff,
  );
  if (fresh.length === 0) {
    console.log(
      `Newest Takeout zip in Drive (${files[0]?.createdTime}) is older than requested_at ${requestedAt.toISOString()}. Not ready yet.`,
    );
    process.exit(3);
  }

  let zipPath: string | null = null;
  let extractDir: string | null = null;

  for (const candidate of fresh) {
    console.log(
      `Checking: ${candidate.name} (${candidate.size} bytes, created ${candidate.createdTime}, id=${candidate.id})`,
    );

    const candidateZipPath = path.join(
      DOWNLOAD_DIR,
      candidate.name ?? `takeout-${Date.now()}.zip`,
    );
    const stream = await drive.files.get(
      { fileId: candidate.id!, alt: "media" },
      { responseType: "stream" },
    );
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(candidateZipPath);
      stream.data.on("error", reject);
      out.on("error", reject);
      out.on("close", resolve);
      stream.data.pipe(out);
    });
    console.log(
      `Downloaded → ${candidateZipPath} (${fs.statSync(candidateZipPath).size} bytes)`,
    );

    const candidateExtractDir = path.join(
      DOWNLOAD_DIR,
      `extract-${Date.now()}`,
    );
    fs.mkdirSync(candidateExtractDir, { recursive: true });
    try {
      execSync(
        `unzip -j -o "${candidateZipPath}" "*/watch-history.json" -d "${candidateExtractDir}"`,
        {
          stdio: "inherit",
        },
      );
      zipPath = candidateZipPath;
      extractDir = candidateExtractDir;
      break;
    } catch {
      fs.rmSync(candidateExtractDir, { recursive: true, force: true });
      console.log(
        "No watch-history.json in this zip; trying next fresh Takeout zip.",
      );
    }
  }

  if (!zipPath || !extractDir) {
    console.error("No fresh Takeout zip contained watch-history.json.");
    process.exit(3);
  }

  const extracted = path.join(extractDir, "watch-history.json");
  if (!fs.existsSync(extracted)) {
    console.error("watch-history.json not in zip.");
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(FINAL_PATH), { recursive: true });
  fs.copyFileSync(extracted, FINAL_PATH);
  console.log(`Placed → ${FINAL_PATH}`);

  fs.rmSync(extractDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("Download failed:", err);
  process.exit(2);
});
