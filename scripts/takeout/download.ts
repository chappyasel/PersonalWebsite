/** Drive-only archive discovery. No browser or export requests.
 * Exit 0: staged history + provenance; 3: no newer YouTube archive;
 * 1: Drive auth failure; 2: download/extraction/argument failure.
 * Optional filters: --after-export-created-at <ISO>, --exclude-file-id <id>.
 * --requested-at <ISO> remains available for older standalone callers.
 */
import {
  type TakeoutSidecar,
  parseTakeoutTimestamp,
  sidecarPathFor,
} from "../../src/lib/youtube/coverage";
import { execFileSync } from "child_process";
import * as fs from "fs";
import type { drive_v3 } from "googleapis";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import * as path from "path";

import { takeoutPaths } from "./config";
import { getDrive } from "./drive";

export type DownloadOptions = {
  afterExportCreatedAt?: string;
  excludeFileId?: string;
  requestedAt?: string;
};

function archiveTime(file: drive_v3.Schema$File): string | undefined {
  if (file.createdTime && Number.isFinite(Date.parse(file.createdTime))) {
    return new Date(file.createdTime).toISOString();
  }
  return parseTakeoutTimestamp(file.name ?? "")?.toISOString();
}

export async function downloadLatestArchive(
  options: DownloadOptions = {},
): Promise<0 | 3> {
  for (const value of [options.afterExportCreatedAt, options.requestedAt]) {
    if (value !== undefined && !Number.isFinite(Date.parse(value))) {
      throw new Error("Invalid archive date filter");
    }
  }
  const drive = getDrive();
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const response = await drive.files.list({
      q: "name contains 'takeout-' and (mimeType = 'application/zip' or mimeType = 'application/x-zip-compressed' or mimeType = 'application/x-zip') and trashed = false",
      orderBy: "createdTime desc",
      pageSize: 100,
      fields: "nextPageToken,files(id,name,size,createdTime,md5Checksum)",
      pageToken,
    });
    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Request age never filters the refresh path. The only watermark there is
  // the archive whose sync succeeded, not its download or ingestion time.
  const candidates = files
    .flatMap((file) => {
      const at = archiveTime(file);
      if (!file.id || !at || file.id === options.excludeFileId) return [];
      if (
        options.afterExportCreatedAt &&
        Date.parse(at) <= Date.parse(options.afterExportCreatedAt)
      )
        return [];
      if (
        options.requestedAt &&
        Date.parse(at) < Date.parse(options.requestedAt) - 3_600_000
      )
        return [];
      return [{ file, at }];
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const { incomingDir: incoming, historyPath: finalPath } = takeoutPaths();
  fs.mkdirSync(incoming, { recursive: true });
  for (const { file, at } of candidates) {
    const staging = fs.mkdtempSync(path.join(incoming, "download-"));
    try {
      const zipPath = path.join(staging, "archive.zip");
      const stream = await drive.files.get(
        { fileId: file.id!, alt: "media" },
        { responseType: "stream" },
      );
      await pipeline(stream.data, fs.createWriteStream(zipPath));
      // Listing errors indicate a broken zip, not an export that isn't ready.
      const entries = execFileSync("unzip", ["-Z1", zipPath], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: "pipe",
      });
      const histories = entries
        .split(/\r?\n/)
        .filter((entry) => /(^|\/)watch-history\.json$/.test(entry));
      if (!histories.length) continue; // Service suffixes change; inspect contents.
      if (histories.length !== 1)
        throw new Error("Ambiguous watch history archive");
      const extracted = path.join(staging, "watch-history.json");
      const fd = fs.openSync(extracted, "w");
      try {
        execFileSync("unzip", ["-p", zipPath, histories[0]!], {
          stdio: ["ignore", fd, "pipe"],
        });
      } finally {
        fs.closeSync(fd);
      }
      const sidecar: TakeoutSidecar = {
        exportCreatedAt: at,
        sourceFile: file.name ?? "unknown-takeout.zip",
        driveFileId: file.id!,
        downloadedAt: new Date().toISOString(),
      };
      const metaPath = path.join(staging, "watch-history.meta.json");
      fs.writeFileSync(metaPath, JSON.stringify(sidecar, null, 2));
      fs.renameSync(extracted, finalPath);
      fs.renameSync(metaPath, sidecarPathFor(finalPath));
      console.log(JSON.stringify({ event: "archive_staged", ...sidecar }));
      return 0;
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
  console.log("No newer Takeout archive contains watch-history.json.");
  return 3;
}

function parseArgs(): DownloadOptions {
  const options: DownloadOptions = {};
  const names: Record<string, keyof DownloadOptions> = {
    "--after-export-created-at": "afterExportCreatedAt",
    "--exclude-file-id": "excludeFileId",
    "--requested-at": "requestedAt",
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]!];
    const value = args[i + 1];
    if (!key || !value || value.startsWith("--"))
      throw new Error("Invalid download arguments");
    options[key] = value;
  }
  return options;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    process.exitCode = await downloadLatestArchive(parseArgs());
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const authFailed =
      /invalid_grant|unauthorized|refresh token|OAuth client|invalid authentication credentials/i.test(
        message,
      );
    // Never dump a Google API error object: it can include request credentials.
    console.error(
      authFailed ? "Drive authentication failed." : "Takeout download failed.",
    );
    process.exitCode = authFailed ? 1 : 2;
  }
}
