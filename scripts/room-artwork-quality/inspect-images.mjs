import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3338";
const catalog = JSON.parse(
  await readFile(
    "src/app/components/stacks/illustration/artwork/catalog.json",
    "utf8",
  ),
);
const output = "docs/reviews/room-artwork-quality-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [key, c] of Object.entries(catalog)) {
    await page.setContent(
      `<body style="margin:0;background:#d9dfd3"><img alt="${c.unit} shelf" style="display:block;width:${c.drawingWidth}px" src="${base}${c.src}"></body>`,
    );
    await page.locator("img").evaluate((image) => image.decode());
    const value = await page.locator("img").evaluate((image) => ({
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
    if (!value.complete || !value.width || !value.height)
      throw Error("Image decode failed " + key);
    rows.push({ key, ...value });
    if (
      c.theme === "light" &&
      c.viewport === "desktop" &&
      ["projects", "talks"].includes(c.unit)
    )
      await page
        .locator("img")
        .screenshot({ path: `${output}/${c.unit}-native-svg-dpr2.png` });
  }
  if (errors.length) throw Error("Page errors " + JSON.stringify(errors));
  await writeFile(
    `${output}/native-svg-image-checks.json`,
    JSON.stringify(
      {
        renderer:
          "headless Chromium standard img, embedded WebP; no scene/3D page opened",
        cases: rows,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Decoded all", rows.length, "standalone SVG images");
} finally {
  await browser.close();
}
