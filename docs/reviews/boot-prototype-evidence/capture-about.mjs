// Run only with the coordinator's browser capture slot. Captures current About
// markup at its initial stage for style comparison; this is not a live 3D test.
import fs from "node:fs/promises";
import { chromium } from "playwright";

if (!process.argv.includes("--capture-slot")) {
  throw new Error("The serialized browser capture slot is required.");
}

const output = new URL("./", import.meta.url);
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const observations = [];
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    try {
      await context.addInitScript((value) => {
        localStorage.setItem("theme", value);
      }, theme);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:3321/?nomeadow&nopostfx", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.addStyleTag({
        content: `
          html .stacks-boot {
            display: grid !important; opacity: 1 !important;
            visibility: visible !important; z-index: 9999 !important;
            transition: none !important;
          }
          html .stacks-boot-threshold,
          html[data-world="ready"] .stacks-boot-threshold,
          html .stacks-boot-item-motion {
            opacity: 1 !important; transform: none !important;
            animation: none !important; transition: none !important;
          }
          html .stacks-boot-entry {
            opacity: 1 !important; animation: none !important;
            transition: none !important;
            transform: translate(var(--stacks-boot-stage-shift-x), var(--stacks-boot-stage-shift-y))
              scale(var(--stacks-boot-stage-shift-scale)) !important;
          }
        `,
      });
      await page.evaluate(() => {
        document.documentElement.dataset.bootStage = "start";
      });
      await page.locator(".stacks-boot-scene").waitFor({ state: "visible" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.querySelectorAll(".stacks-boot img")).map((img) =>
            img.decode().catch(() => {}),
          ),
        );
      });
      observations.push({
        theme,
        method:
          "Current About DOM, initial stage forced visible, reduced motion",
        sceneBounds: await page.locator(".stacks-boot-scene").boundingBox(),
      });
      await page.screenshot({
        path: new URL(`about-${theme}-1440x900.png`, output).pathname,
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  new URL("about-observations.json", output),
  JSON.stringify(observations, null, 2) + "\n",
);
console.log("About style references saved; browser closed.");
