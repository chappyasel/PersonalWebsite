// The Stacks photo pipeline — copies the APPROVED picks from the local photo
// library into public/images/stacks/ with neutral filenames, capped at 768px
// long edge, JPEG q72, metadata stripped (sharp drops EXIF/GPS by default).
//
//   node scripts/stacks-photos.mjs
//   PHOTOS_BASE=/path/to/library node scripts/stacks-photos.mjs
//
// Sources are relative to the library root (default ~/Desktop/Other/
// "4 Pictures") — the same relative form the v4 audit's approved shortlist
// uses (docs/research/2026-08-09-stacks-v4-element-audit.md §5). Only
// approved picks belong here; never point this at unreviewed folders.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE =
  process.env.PHOTOS_BASE ??
  path.join(os.homedir(), "Desktop", "Other", "4 Pictures");
const OUT = path.join(process.cwd(), "public", "images", "stacks");

const MANIFEST = [
  { src: "2024/2 SF Gyms/IMG_6281.jpg", out: "gym-mirror.jpg", note: "training frame" },
  { src: "2026/5 Consensus/After/2026-05-07 15_40-14_00 Fireside_ Chappy Asel/Cropped/TW203702.jpg", out: "talk-consensus.jpg", note: "talks frame 2 override" },
  { src: "2026/5 Consensus/After/2026-05-07 15_40-14_00 Fireside_ Chappy Asel/TW203736.jpg", out: "talk-consensus-alt.jpg", note: "staged alternate (browse gate)" },
  { src: "2025/8 MVY/Personal/IMG_1237.png", out: "beach-sunset.jpg", note: "About polaroid" },
  { src: "2019/8 MVY/Bros Lifeguard/19_RandiBaird_ASEL_0044.jpg", out: "bros.jpg", note: "About polaroid", crop: "square" },
  { src: "2021/9 Europe/2 Budapest/IMG_5223-2.jpg", out: "postcard-budapest.jpg", note: "postcard by the globe" },
  { src: "2026/8 Stanford/7.jpg", out: "portrait-alt.jpg", note: "portrait A/B (staged, unwired)" },
  { src: "2026/8 Stanford/2.jpg", out: "talk-stanford.jpg", note: "Talks lower shelf frame (replaced the mic)" },
];

const { default: sharp } = await import("sharp");
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const item of MANIFEST) {
  const srcPath = path.join(BASE, item.src);
  if (!fs.existsSync(srcPath)) {
    console.error(`MISSING ${item.src}`);
    process.exitCode = 1;
    continue;
  }
  let img = sharp(srcPath).rotate(); // bake EXIF orientation before stripping
  if (item.crop === "square") {
    const meta = await sharp(srcPath).metadata();
    const side = Math.min(meta.width, meta.height);
    img = img.resize(side, side, { fit: "cover" });
  }
  const outPath = path.join(OUT, item.out);
  await img
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(outPath);
  const size = fs.statSync(outPath).size;
  total += size;
  console.log(`${item.out.padEnd(24)} ${(size / 1024).toFixed(1).padStart(6)} KB  (${item.note})`);
}
console.log(`total: ${(total / 1024).toFixed(1)} KB (budget ≤ 700 KB)`);
