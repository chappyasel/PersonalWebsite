#!/usr/bin/env node
/**
 * Pull every icon the site ships from a running dev server and lay them out
 * the way browsers show them: 16px in light and dark tab strips, 32 and 64
 * for pixel-peeping, home-screen tiles under an iOS mask, and the profile
 * photo as a circle and as a square. Section favicons are SVGs whose
 * `prefers-color-scheme: dark` block is what the dark strip shows; the sheet
 * inlines each one twice, the dark copy with that media query forced on.
 * Writes the files, an HTML sheet, and a screenshot of the sheet.
 *
 *   pnpm dev                    (in another terminal)
 *   pnpm preview:favicons -- --base http://localhost:3000 --out favicon-previews
 *
 * Pass `--book <slug>` to add one book's own cover icon as a row.
 *
 * The output folder is gitignored.
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

const exec = promisify(execFile);

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const base = option("base", "http://localhost:3000").replace(/\/$/, "");
const out = path.resolve(option("out", "favicon-previews"));
const fileDir = path.join(out, "png");

const THEMES = ["light", "dark"];

/**
 * Every section and the page title its tab shows. `svg` sections ship an
 * adaptive SVG favicon plus PNG tab/app icons; the home photo and the
 * library cover are PNG only.
 */
const book = option("book", "");
const SITES = [
  { key: "home", title: "Chappy Asel", tab: "/icon", app: "/apple-icon/180" },
  { key: "books", title: "Chappy's Book Notes", svg: "/books" },
  ...(book
    ? [{ key: "book", title: `${book} ~ Book Notes`, tab: `/books/${book}/icon`, app: `/books/${book}/icon` }]
    : []),
  { key: "weightlifting", title: "Weightlifting ~ Chappy Asel", svg: "/weightlifting" },
  { key: "routine", title: "Core Daily Routine ~ Chappy Asel", svg: "/routine" },
  { key: "manual", title: "Personal Operating Manual ~ Chappy Asel", svg: "/manual" },
  { key: "liarsdice", title: "Liar's Dice Calculator ~ Chappy Asel", svg: "/liarsdice" },
  { key: "dad", title: "Dad's Journal", svg: "/dad" },
  { key: "youtube", title: "YouTube Watch History", svg: "/youtube" },
];

const svgs = new Map();

async function download(route, file) {
  const response = await fetch(`${base}${route}`);
  if (!response.ok) {
    throw new Error(`${route} → ${response.status}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    throw new Error(`${route} → ${type || "no content-type"}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(file, body);
  return body;
}

async function downsample(source, target, px) {
  try {
    await exec("sips", ["-z", String(px), String(px), source, "--out", target]);
    return true;
  } catch {
    return false;
  }
}

/**
 * An inline copy of a section's SVG, scoped per theme and pinned to it: the
 * light copy has its dark block removed, the dark copy has it forced on, so
 * the sheet reads the same on a light Mac and a dark one.
 */
function inlineSvg(site, theme, px) {
  let svg = svgs.get(site.key);
  if (!svg) return "";
  const scope = `${site.key}-${theme}-${px}`;
  svg = svg.replaceAll(`#${site.key} `, `#${scope} `).replaceAll(`"${site.key}-`, `"${scope}-`).replaceAll(`url(#${site.key}-`, `url(#${scope}-`).replace(`id="${site.key}"`, `id="${scope}"`);
  svg =
    theme === "dark"
      ? svg.replace("@media (prefers-color-scheme: dark)", "@media all")
      : svg.replace(/@media \(prefers-color-scheme: dark\)\{.*?\}\}<\/style>/, "</style>");
  return svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);
}

function img(file, px) {
  return `<img src="png/${file}" width="${px}" height="${px}" alt="">`;
}

/** The tab-strip icon for a site in a theme, at a pixel size. */
function tabIcon(site, theme, px) {
  return site.svg ? inlineSvg(site, theme, px) : img(`${site.key}-tab.png`, px);
}

function tab(site, theme, active) {
  return `<div class="tab${active ? " active" : ""}">${tabIcon(site, theme, 16)}<span>${site.title}</span></div>`;
}

function strip(theme, sites) {
  return `<div class="strip ${theme}">${sites
    .map((site, index) => tab(site, theme, index % 3 === 1))
    .join("")}</div>`;
}

function sizeRow(site, sips) {
  const cells = THEMES.map((theme) => {
    const resampled = site.svg ? "" : `${site.key}-tab`;
    return `<td class="${theme}">${tabIcon(site, theme, 16)} ${resampled && sips ? img(`${resampled}-16.png`, 16) : ""} ${tabIcon(site, theme, 32)} ${resampled && sips ? img(`${resampled}-32.png`, 32) : ""} ${tabIcon(site, theme, 64)}</td>`;
  });
  return `<tr><th>${site.key}</th>${cells.join("")}</tr>`;
}

function tiles(sites) {
  return `<div class="tiles">${sites
    .map(
      (site) =>
        `<figure><div class="ios">${img(`${site.key}-app.png`, 60)}</div><figcaption>${site.key}</figcaption></figure>`,
    )
    .join("")}</div>`;
}

function shape(px, round) {
  return `<img src="png/profile.jpg" width="${px}" height="${px}" style="border-radius:${round === "circle" ? "50%" : round === "rounded" ? "22.5%" : "0"}" alt="">`;
}

function sheet({ sites, sips }) {
  const shapeRows = ["circle", "rounded", "square"]
    .map(
      (round) =>
        `<tr><th>${round}</th>${THEMES.map((theme) => `<td class="${theme}">${shape(16, round)} ${shape(32, round)} ${shape(64, round)}</td>`).join("")}</tr>`,
    )
    .join("\n");

  return `<!doctype html>
<meta charset="utf-8">
<title>Favicon previews</title>
<link rel="icon" href="png/home-tab.png" type="image/png">
<style>
  body { margin: 0; padding: 32px 40px 48px; font: 13px/1.4 -apple-system, "SF Pro Text", system-ui, sans-serif; color: #333; background: #fafaf9; max-width: 1060px }
  h1 { font-size: 18px; margin: 0 0 4px } h2 { font-size: 14px; margin: 36px 0 10px; color: #555 }
  p { margin: 0 0 12px; color: #666 }
  .strip { display: flex; gap: 4px; padding: 8px 8px 0; border-radius: 10px 10px 0 0; margin-bottom: 2px; overflow: hidden }
  .strip.light { background: #dee1e6 } .strip.dark { background: #202124 }
  .tab { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 8px 8px 0 0; font-size: 12px; min-width: 0; flex: 1 1 0 }
  .tab span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .light .tab { color: #3c4043 } .light .tab.active { background: #fff }
  .dark .tab { color: #bdc1c6 } .dark .tab.active { background: #35363a; color: #e8eaed }
  .tab img, .tab svg { width: 16px; height: 16px; flex: none }
  table { border-collapse: separate; border-spacing: 0 4px } th { text-align: left; font-weight: 500; padding: 6px 16px 6px 0; color: #555 }
  td { padding: 8px 14px; vertical-align: middle; white-space: nowrap } td img, td svg { vertical-align: middle; margin-right: 10px }
  td.light { background: #fff; border-radius: 6px 0 0 6px } td.dark { background: #202124; border-radius: 0 6px 6px 0 }
  thead th { font-size: 11px; color: #888; padding-bottom: 0 }
  .tiles { display: flex; flex-wrap: wrap; gap: 18px; padding: 22px; border-radius: 16px; margin-bottom: 10px; background: linear-gradient(160deg, #cfd9e6, #a9b7c9) }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: #334 }
  .ios { width: 60px; height: 60px; border-radius: 22.5%; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,.18) } .ios img { width: 100%; height: 100%; display: block }
  .big { display: flex; gap: 20px; align-items: flex-end; margin-top: 12px }
  .big img { border-radius: 22.5%; box-shadow: 0 2px 8px rgba(0,0,0,.2) }
  .android { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.2) } .android img { width: 100%; height: 100%; display: block }
  code { font: 12px ui-monospace, Menlo, monospace; color: #444 }
</style>
<h1>Favicon previews</h1>
<p>Pulled from <code>${base}</code>. Section favicons are the shipped SVGs, inlined and pinned: the light column is what a light-themed browser draws, the dark column what its <code>prefers-color-scheme: dark</code> block draws, whatever this Mac is set to. The photo and the library cover are the shipped 64px PNGs, downsampled by the browser as a tab strip would.</p>

<h2>Tab strips</h2>
${strip("light", sites)}
${strip("dark", sites)}

<h2>Every size</h2>
<p>Per scheme: 16, 32, 64. PNG rows also show a sips resample after each browser-scaled 16 and 32.</p>
<table><thead><tr><th></th><th>light</th><th>dark</th></tr></thead><tbody>
${sites.map((site) => sizeRow(site, sips)).join("\n")}
</tbody></table>

<h2>Home screen (apple-touch-icon, 180)</h2>
<p>Static PNG tiles, light scheme; the OS masks them.</p>
${tiles(sites)}
<div class="big">
  <figure><img src="png/home-app-180.png" width="120" height="120" alt=""><figcaption>180 at 2x</figcaption></figure>
  <figure><div class="android"><img src="png/home-app-512.png" alt=""></div><figcaption>512 under an Android circle mask</figcaption></figure>
</div>

<h2>Profile shape</h2>
<p>The whole photo, no crop. The tab ships the rounded square, the corner every tab icon shares; the tiles ship the square and let the OS mask it. The circle is here for comparison only.</p>
<table><thead><tr><th></th><th>light</th><th>dark</th></tr></thead><tbody>
${shapeRows}
</tbody></table>
`;
}

async function main() {
  await mkdir(fileDir, { recursive: true });

  const jobs = [];
  for (const site of SITES) {
    if (site.svg) {
      jobs.push(
        download(`${site.svg}/tab-icon`, path.join(fileDir, `${site.key}.svg`)).then(
          (body) => svgs.set(site.key, body.toString("utf8")),
        ),
      );
      jobs.push(download(`${site.svg}/icon/tab`, path.join(fileDir, `${site.key}-tab.png`)));
      jobs.push(download(`${site.svg}/icon/app`, path.join(fileDir, `${site.key}-app.png`)));
    } else {
      jobs.push(download(site.tab, path.join(fileDir, `${site.key}-tab.png`)));
      jobs.push(download(site.app, path.join(fileDir, `${site.key}-app.png`)));
    }
  }
  jobs.push(download("/apple-icon/180", path.join(fileDir, "home-app-180.png")));
  jobs.push(download("/apple-icon/512", path.join(fileDir, "home-app-512.png")));
  jobs.push(
    download("/images/about/profile.jpg", path.join(fileDir, "profile.jpg")),
  );
  const results = await Promise.allSettled(jobs);
  const failures = results.filter((result) => result.status === "rejected");
  for (const failure of failures) {
    console.error(`  failed: ${failure.reason.message}`);
  }

  let sips = true;
  for (const site of SITES.filter((entry) => !entry.svg)) {
    const source = path.join(fileDir, `${site.key}-tab.png`);
    for (const px of [16, 32]) {
      const target = path.join(fileDir, `${site.key}-tab-${px}.png`);
      sips &&= await downsample(source, target, px);
    }
  }

  const htmlPath = path.join(out, "index.html");
  await writeFile(htmlPath, sheet({ sites: SITES, sips }));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1140, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(out, "contact-sheet.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`wrote ${out}`);
  console.log(
    `  ${results.length - failures.length} files, sheet at index.html, screenshot at contact-sheet.png`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
