import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import "server-only";

export const UNITS = [
  "projects",
  "weightlifting",
  "books",
  "systems",
  "musings",
  "talks",
] as const;
export const CASES = [
  "light-desktop",
  "dark-desktop",
  "light-phone",
  "dark-phone",
] as const;
export type Unit = (typeof UNITS)[number];
export type CaptureCase = (typeof CASES)[number];
export type Capture = {
  ready: boolean;
  version: number;
  bytes: number | null;
  drawingWidth: number;
};
export type Summary = Record<Unit, Record<CaptureCase, Capture>>;

type Manifest = {
  totalArtworkBytes?: number;
  viewBox?: number[];
  parts?: { id: string; box?: number[] }[];
};

async function builderRoot() {
  const run = JSON.parse(
    await readFile(
      path.join(process.cwd(), "docs/reviews/room-boot-shelf-run.json"),
      "utf8",
    ),
  ) as { workers: { task: string; worktree: string }[] };
  const worker = run.workers.find(
    (entry) => entry.task === "room-boot-shelf-builder",
  );
  if (!worker) throw new Error("Shared capture workspace is unavailable");
  return worker.worktree;
}

async function captureDirectory(unit: Unit, capture: CaptureCase) {
  const root = await builderRoot();
  return path.join(root, "public/room-boot-shelf-prototype", unit, capture);
}

async function describeCapture(
  unit: Unit,
  capture: CaptureCase,
): Promise<Capture> {
  const directory = await captureDirectory(unit, capture);
  const [svgStat, raw] = await Promise.all([
    stat(path.join(directory, "artwork.svg")).catch(() => null),
    readFile(path.join(directory, "manifest.json"), "utf8").catch(() => null),
  ]);
  const manifest = raw ? (JSON.parse(raw) as Manifest) : null;
  const shelfWidth = manifest?.parts?.find((part) => part.id === "shelf")
    ?.box?.[2];
  const viewWidth = manifest?.viewBox?.[2];
  return {
    ready: Boolean(svgStat && manifest),
    version: svgStat?.mtimeMs ?? 0,
    bytes: manifest?.totalArtworkBytes ?? null,
    drawingWidth:
      shelfWidth && viewWidth ? (500 * viewWidth) / shelfWidth : 690,
  };
}

export async function getSummary(): Promise<Summary> {
  return Object.fromEntries(
    await Promise.all(
      UNITS.map(
        async (unit) =>
          [
            unit,
            Object.fromEntries(
              await Promise.all(
                CASES.map(
                  async (capture) =>
                    [capture, await describeCapture(unit, capture)] as const,
                ),
              ),
            ),
          ] as const,
      ),
    ),
  ) as Summary;
}

export async function readAsset(
  unit: Unit,
  capture: CaptureCase,
  file: string,
) {
  const directory = await captureDirectory(unit, capture);
  const content = await readFile(path.join(directory, file));
  if (file !== "artwork.svg") return content;
  return content
    .toString("utf8")
    .replace(/href="([^"]+)"/g, (attribute, href: string) => {
      const filename = href.split("/").at(-1);
      if (!filename || !/^[a-zA-Z0-9_.-]+\.(webp|png)$/.test(filename))
        return attribute;
      const query = new URLSearchParams({
        unit,
        case: capture,
        file: filename,
      });
      return `href="/admin/room-boot-comparison/asset?${query.toString().replaceAll("&", "&amp;")}"`;
    });
}
