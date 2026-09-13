import fs from "node:fs/promises";
import path from "node:path";
import "server-only";

export const CAPTURE_CASES = [
  "light-1440x900",
  "light-2056x1290",
  "light-390x844",
  "dark-1440x900",
  "dark-2056x1290",
  "dark-390x844",
] as const;
export type CaptureCase = (typeof CAPTURE_CASES)[number];

export type CaseSummary = {
  aReady: boolean;
  bReady: boolean;
  aBytes: number | null;
  bRawBytes: number | null;
  bIllustratedBytes: number | null;
};
export type ComparisonSummary = Record<CaptureCase, CaseSummary>;

async function roots() {
  const run = JSON.parse(
    await fs.readFile(
      path.join(process.cwd(), "docs/reviews/boot-prototype-run.json"),
      "utf8",
    ),
  ) as {
    workers: { task: string; worktree: string }[];
  };
  const a = run.workers.find((worker) => worker.task === "geometry")?.worktree;
  const b = run.workers.find(
    (worker) => worker.task === "render-masks",
  )?.worktree;
  if (!a || !b) throw new Error("Prototype worktrees are not configured.");
  return { a, b };
}

export const ASSET_KINDS = [
  "a",
  "a-full",
  "live",
  "b-raw",
  "b-illustrated",
  "b-raw-full",
  "b-illustrated-full",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export async function captureAsset(capture: CaptureCase, kind: AssetKind) {
  const { a, b } = await roots();
  const aRoot = path.join(a, "public/boot-prototype-geometry", capture);
  const bRoot = path.join(b, "docs/reviews/boot-render-masks-evidence");
  const files: Record<AssetKind, string> = {
    a: path.join(aRoot, "artwork-initial-size.png"),
    "a-full": path.join(aRoot, "artwork-full-specimen.png"),
    live: path.join(aRoot, "live-initial-size.png"),
    "b-raw": path.join(bRoot, `${capture}-raw-chromium-initial.png`),
    "b-illustrated": path.join(
      bRoot,
      `${capture}-illustrated-chromium-initial.png`,
    ),
    "b-raw-full": path.join(bRoot, `${capture}-raw-chromium-full.png`),
    "b-illustrated-full": path.join(
      bRoot,
      `${capture}-illustrated-chromium-full.png`,
    ),
  };
  return fs.readFile(files[kind]);
}

async function jsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function comparisonSummary(): Promise<ComparisonSummary> {
  const { a, b } = await roots();
  const entries = await Promise.all(
    CAPTURE_CASES.map(async (capture) => {
      const [aData, bData, aReady, bReady] = await Promise.all([
        jsonFile<{ svgGzip: number; detailBytes: number }>(
          path.join(
            a,
            "public/boot-prototype-geometry",
            capture,
            "evidence.json",
          ),
        ),
        jsonFile<{
          payload: {
            rawSvgGzipBytes: number;
            illustratedSvgGzipBytes: number;
            detailRawBytes: number;
            detailIllustratedBytes: number;
          };
        }>(
          path.join(
            b,
            "public/boot-render-masks-prototype",
            capture,
            "measurements.json",
          ),
        ),
        captureAsset(capture, "a").then(
          () => true,
          () => false,
        ),
        captureAsset(capture, "b-raw").then(
          () => true,
          () => false,
        ),
      ]);
      return [
        capture,
        {
          aReady,
          bReady,
          aBytes: aData ? aData.svgGzip + aData.detailBytes : null,
          bRawBytes: bData
            ? bData.payload.rawSvgGzipBytes + bData.payload.detailRawBytes
            : null,
          bIllustratedBytes: bData
            ? bData.payload.illustratedSvgGzipBytes +
              bData.payload.detailIllustratedBytes
            : null,
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as ComparisonSummary;
}
