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

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
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
      console.error("Drive auth failed — refresh token may be revoked. Re-run `yarn takeout:drive-auth`.");
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

  // Pick fresh files (createdTime ≥ requested_at − 1h). Each export delivers
  // multiple zips — the YouTube history one matches "-3-" in the name pattern
  // (e.g. takeout-20260519T144721Z-3-001.zip). Prefer those; fall back to any.
  const marginMs = 60 * 60_000;
  const cutoff = new Date(requestedAt.getTime() - marginMs);
  const fresh = files.filter((f) => f.createdTime && new Date(f.createdTime) >= cutoff);
  if (fresh.length === 0) {
    console.log(
      `Newest Takeout zip in Drive (${files[0]?.createdTime}) is older than requested_at ${requestedAt.toISOString()}. Not ready yet.`,
    );
    process.exit(3);
  }

  // Prefer the "-3-" variant (YouTube data); fall back to any fresh zip.
  const ytZips = fresh.filter((f) => /-3-\d+\.zip$/i.test(f.name ?? ""));
  const pick = ytZips[0] ?? fresh[0]!;
  console.log(
    `Found: ${pick.name} (${pick.size} bytes, created ${pick.createdTime}, id=${pick.id})`,
  );

  // Download
  const zipPath = path.join(DOWNLOAD_DIR, pick.name ?? `takeout-${Date.now()}.zip`);
  const stream = await drive.files.get(
    { fileId: pick.id!, alt: "media" },
    { responseType: "stream" },
  );
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    stream.data.on("error", reject);
    out.on("error", reject);
    out.on("close", resolve);
    stream.data.pipe(out);
  });
  console.log(`Downloaded → ${zipPath} (${fs.statSync(zipPath).size} bytes)`);

  // Extract watch-history.json from any path inside the zip.
  const extractDir = path.join(DOWNLOAD_DIR, `extract-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    execSync(`unzip -j -o "${zipPath}" "*/watch-history.json" -d "${extractDir}"`, {
      stdio: "inherit",
    });
  } catch (err) {
    console.error("unzip failed:", err instanceof Error ? err.message : String(err));
    console.error("Zip contents:");
    try {
      execSync(`unzip -l "${zipPath}" | head -50`, { stdio: "inherit" });
    } catch {
      /* ignore */
    }
    process.exit(2);
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
