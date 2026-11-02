/**
 * Each crossing theme's accent as a tiny looping 10-bit HEVC video in Rec. 2020
 * with the PQ transfer (public/hdr/accent-dark.mp4 and accent-light.mp4).
 * Safari shows HDR only in video, so this is what makes a mark brighter than
 * white there. Port of coordination.sh's brand/hdr-accent.py: the accents are
 * the same, and so are the decoded frames.
 *
 * The colour's strongest channel sits at PEAK_NITS and the others keep their
 * ratio to it. 800 nits, about 4x SDR white, is the brightest that keeps the
 * hue at everyday screen brightness. At the XDR panel's 1600, a Mac without
 * that much headroom caps the red and the orange turns yellow.
 *
 *     pnpm generate:hdr-accent   # needs ffmpeg with libx265
 */
import { CROSSING_TOKENS } from "../../src/app/components/stacks/scene/coordinationCrossing";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PEAK_NITS = 800;
const SDR_WHITE_NITS = 203;
const OUT = path.resolve(process.argv[2] ?? "public/hdr");

const SRGB_TO_2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0114],
  [0.0164, 0.088, 0.8956],
] as const;

function linear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function pq(nits: number) {
  const [m1, m2, c1, c2, c3] = [
    0.1593017578125, 78.84375, 0.8359375, 18.8515625, 18.6875,
  ] as const;
  const y = Math.min(1, Math.max(0, nits / 10000)) ** m1;
  return ((c1 + c2 * y) / (1 + c3 * y)) ** m2;
}

/** The accent in linear Rec. 2020 nits, its strongest channel at the peak. */
function peak(accent: readonly number[]) {
  const source = accent.map(linear);
  const rec2020 = SRGB_TO_2020.map((row) =>
    row.reduce((sum, weight, index) => sum + weight * source[index]!, 0),
  );
  const strongest = Math.max(...rec2020);
  return rec2020.map((value) => (value / strongest) * PEAK_NITS);
}

function encode(nits: number[], out: string) {
  const [width, height, frames] = [64, 128, 4];
  const pixel = Buffer.alloc(6);
  nits.forEach((value, channel) =>
    pixel.writeUInt16BE(Math.round(pq(value) * 65535), channel * 2),
  );
  const input = Buffer.concat(
    Array.from({ length: width * height * frames }, () => pixel),
  );
  execFileSync(
    "ffmpeg",
    [
      ...["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb48be"],
      ...["-s", `${width}x${height}`, "-r", "2", "-i", "-"],
      ...[
        "-vf",
        "scale=out_color_matrix=bt2020:out_range=tv,format=yuv420p10le",
      ],
      ...["-c:v", "libx265", "-tag:v", "hvc1"],
      "-x265-params",
      "log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited",
      ...["-color_primaries", "bt2020", "-color_trc", "smpte2084"],
      ...["-colorspace", "bt2020nc", "-color_range", "tv"],
      ...["-an", "-movflags", "+faststart", out],
    ],
    { input },
  );
}

mkdirSync(OUT, { recursive: true });
for (const theme of ["dark", "light"] as const) {
  const nits = peak(CROSSING_TOKENS[theme].accent);
  encode(nits, path.join(OUT, `accent-${theme}.mp4`));
  const multiple = (Math.max(...nits) / SDR_WHITE_NITS).toFixed(1);
  console.log(
    theme,
    nits.map((value) => Math.round(value)).join(" "),
    `${multiple}x SDR white`,
  );
}
