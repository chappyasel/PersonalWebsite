// The Stacks photo pipeline — copies the APPROVED picks from the local photo
// libraries into public/images/stacks/ with neutral filenames, capped per prop
// class, JPEG q72, metadata stripped (sharp drops EXIF/GPS by default).
//
//   node scripts/stacks-photos.mjs
//   PHOTOS_BASE=/path/to/library node scripts/stacks-photos.mjs
//
// Three source libraries, selected per entry by `base`: the photo library
// (default, ~/Desktop/Other/"4 Pictures"), "ig", and "tw". The default base
// uses the same relative form as the v4 audit's approved shortlist
// (docs/research/2026-08-09-stacks-v4-element-audit.md §5); round-3 picks and
// their per-unit rationale are in docs/research/2026-08-09-photo-round-3.md.
// Only approved picks belong here; never point this at unreviewed folders.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE =
  process.env.PHOTOS_BASE ??
  path.join(os.homedir(), "Desktop", "Other", "4 Pictures");
// Second library: the curated Instagram archive (owner-approved source,
// 2026-08-09 "you can find GOLD here"). Entries with base:"ig" resolve here.
const IG_BASE =
  process.env.PHOTOS_IG_BASE ??
  path.join(os.homedir(), "Desktop", "Agents", "instagram");
// Third library: the Twitter/X export. Entries with base:"tw" resolve here;
// src includes the export folder so a re-export can be pinned per pick.
const TW_BASE =
  process.env.PHOTOS_TW_BASE ??
  path.join(os.homedir(), "Desktop", "Agents", "twitter", "exports");
const BASES = { ig: IG_BASE, tw: TW_BASE };
const OUT = path.join(process.cwd(), "public", "images", "stacks");

const MANIFEST = [
  // Caps are per prop class, not per source: pins 384, polaroids/postcards 448,
  // framed + leaning prints 512-576. Nothing renders above ~500px on screen.
  {
    src: "2024/2 SF Gyms/IMG_6281.jpg",
    out: "gym-mirror.jpg",
    max: 576,
    note: "training frame",
  },
  {
    src: "2026/5 Consensus/After/2026-05-07 15_40-14_00 Fireside_ Chappy Asel/Cropped/TW203702.jpg",
    out: "talk-consensus.jpg",
    note: "talks frame 2 override",
  },
  {
    src: "2026/5 Consensus/After/2026-05-07 15_40-14_00 Fireside_ Chappy Asel/TW203736.jpg",
    out: "talk-consensus-alt.jpg",
    note: "staged alternate (browse gate)",
  },
  {
    src: "2025/8 MVY/Personal/IMG_1237.png",
    out: "beach-sunset.jpg",
    max: 448,
    note: "About polaroid",
  },
  {
    src: "2019/8 MVY/Bros Lifeguard/19_RandiBaird_ASEL_0044.jpg",
    out: "bros.jpg",
    max: 448,
    note: "About polaroid",
    crop: "square",
  },
  {
    src: "2021/9 Europe/2 Budapest/IMG_5223-2.jpg",
    out: "postcard-budapest.jpg",
    max: 448,
    note: "postcard by the globe",
  },
  {
    src: "2026/8 Stanford/7.jpg",
    out: "portrait-alt.jpg",
    note: "portrait A/B (staged, unwired)",
  },
  {
    src: "2026/8 Stanford/2.jpg",
    out: "talk-stanford.jpg",
    max: 576,
    note: "Talks lower shelf frame (replaced the mic)",
  },
  // Instagram curation round (curator agent picks, 2026-08-09)
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/18008150686860178.jpg",
    out: "pin-dunes.jpg",
    max: 384,
    note: "corkboard pin: brothers in dune grass",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/17993042153806333.jpg",
    out: "pin-trail.jpg",
    max: 384,
    note: "corkboard pin: retreat trail selfie",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/18144474607516645.jpg",
    out: "pin-creek.jpg",
    max: 384,
    note: "corkboard pin: creek footbridge",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/17917514935831632.jpg",
    out: "postcard-arches.jpg",
    max: 448,
    note: "second postcard by the globe",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/18029852812485824.jpg",
    out: "talk-summit.jpg",
    max: 512,
    note: "Talks leaning print: GenAI Summit open",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/18128956828106597.jpg",
    out: "musings-walk.jpg",
    max: 512,
    note: "Musings lower-shelf frame: Joshua Tree walk",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/18071573072019724.jpg",
    out: "golf-flag.jpg",
    max: 384,
    note: "Training polaroid: Chappaquiddick pin flag",
  },

  // Round 3 (2026-08-09): 3-5 photos per unit. Books/Projects/Systems had none.
  // About (0)
  {
    src: "2019/8 MVY/Bros/19_RandiBaird_ASEL_0005.jpg",
    out: "about-brothers.jpg",
    max: 448,
    note: "About polaroid: four brothers, Randi Baird",
  },
  {
    src: "2018/12 Christmas/ChristmasFam.png",
    out: "about-holidays.jpg",
    max: 448,
    note: "About polaroid: brothers + dog at Christmas",
  },
  // Books (1)
  {
    base: "tw",
    src: "twitter-2026-07-31/data/tweets_media/1835742939928240302-GXneaFea4AAXVGX.jpg",
    out: "books-noise.jpg",
    max: 576,
    note: "Books framed: Kahneman's NOISE at his own shelf",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/archived_posts/201908/18089580775046356.jpg",
    out: "books-quiet.jpg",
    max: 448,
    note: "Books polaroid: sitting out a dawn on the sand",
  },
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/18525808411013329.jpg",
    out: "books-goldenhour.jpg",
    max: 448,
    note: "Books polaroid: backlit, mid-thought",
  },
  // Training (2)
  {
    base: "tw",
    src: "twitter-2026-07-31/data/tweets_media/1742265325423337870-GC3E4SOXUAAVkVP.jpg",
    out: "training-squat.jpg",
    max: 512,
    note: "Training framed: racked after a heavy squat (only real lift still)",
  },
  {
    src: "2017/5 Tough Mudder/18589035_10155288216392790_6529538839177459053_o.jpg",
    out: "training-mud.jpg",
    max: 448,
    crop: { width: 0.84 },
    note: "Training polaroid: under the wire (crop drops the event watermark)",
  },
  // Talks (3)
  {
    src: "2026/5 Consensus/After/2026-05-07 15_40-14_00 Fireside_ Chappy Asel/Cropped/TW203665.jpg",
    out: "talk-fireside-wide.jpg",
    max: 576,
    note: "Talks framed: the two-shot, reads as a conversation",
  },
  {
    base: "tw",
    src: "twitter-2026-07-31/data/tweets_media/1798370655718744491-GPUYkVVbMAATdc7.jpg",
    out: "talk-mic.jpg",
    max: 512,
    note: "Talks leaning print: mic in hand, hosting",
  },
  // Projects (4)
  {
    src: "2026/6 Convergence/Edited/x.jpg",
    out: "projects-cabin.jpg",
    max: 576,
    crop: { left: 0.36, top: 0.34, width: 0.64, height: 0.56 },
    note: "Projects framed: the cabin mid-build (crop tightens to the tables)",
  },
  {
    base: "tw",
    src: "twitter-2026-07-31/data/tweets_media/1778892048747417620-GK_k0ALbUAA0u21.jpg",
    out: "projects-whiteboard.jpg",
    max: 448,
    note: "Projects polaroid: whiteboard room, warm wall",
  },
  {
    src: "2024/7/Cofactory goodbye/1.jpg",
    out: "projects-couch.jpg",
    max: 448,
    note: "Projects polaroid: three laptops on one couch",
  },
  {
    src: "2023/4 GAICo/Post/IMG_7754.jpg",
    out: "projects-loft.jpg",
    max: 512,
    note: "Projects leaning print: the room he built (no face)",
  },
  // Musings (5)
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/posts/17922598311011250.jpg",
    out: "musings-shore.jpg",
    max: 384,
    note: "Musings pin: walking an empty shore",
  },
  // Systems (6)
  {
    base: "ig",
    src: "exports/chappyasel-2026-07-23/media/archived_posts/201908/18021287065209882.jpg",
    out: "systems-sunrise.jpg",
    max: 448,
    note: "Systems polaroid: the 5am one",
  },
  {
    src: "2020/6 CA Road Trip/Trip Down/Final/NEEDS_LIQ3-2.jpg",
    out: "systems-ridge.jpg",
    max: 512,
    note: "Systems framed: first light on the ridge",
  },
  {
    src: "2020/6 CA Road Trip/Trip Down/Final/IMG_1815.jpg",
    out: "systems-redwoods.jpg",
    max: 448,
    note: "Systems polaroid: redwoods, arms out",
  },
];

const { default: sharp } = await import("sharp");
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const item of MANIFEST) {
  const srcPath = path.join(BASES[item.base] ?? BASE, item.src);
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
  } else if (item.crop) {
    // Fractional rect, all keys optional: {left,top,width,height} in 0..1.
    // Rotation may swap w/h, so measure after .rotate() rather than from EXIF.
    const { width: w, height: h } = await img
      .toBuffer({ resolveWithObject: true })
      .then((r) => r.info);
    const { left = 0, top = 0, width = 1 - left, height = 1 - top } = item.crop;
    img = sharp(srcPath)
      .rotate()
      .extract({
        left: Math.round(left * w),
        top: Math.round(top * h),
        width: Math.round(width * w),
        height: Math.round(height * h),
      });
  }
  const outPath = path.join(OUT, item.out);
  const cap = item.max ?? 768;
  await img
    .resize(cap, cap, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(outPath);
  const size = fs.statSync(outPath).size;
  total += size;
  console.log(
    `${item.out.padEnd(24)} ${(size / 1024).toFixed(1).padStart(6)} KB  (${item.note})`,
  );
}
console.log(`total: ${(total / 1024).toFixed(1)} KB (budget ≤ 1000 KB)`);
