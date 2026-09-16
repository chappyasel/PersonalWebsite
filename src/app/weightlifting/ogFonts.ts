import { readFile } from "node:fs/promises";
import { join } from "node:path";

let pending: ReturnType<typeof readFonts> | undefined;

async function readFonts() {
  const directory = join(process.cwd(), "src/fonts/weightlifting");
  const [regular, semibold, rounded] = await Promise.all([
    readFile(join(directory, "SF-Pro-Display-Regular.otf")),
    readFile(join(directory, "SF-Pro-Display-Semibold.otf")),
    readFile(join(directory, "SF-Pro-Rounded-Bold.otf")),
  ]);
  return [
    {
      name: "SF Pro Display",
      data: new Uint8Array(regular).buffer,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "SF Pro Display",
      data: new Uint8Array(semibold).buffer,
      weight: 600 as const,
      style: "normal" as const,
    },
    {
      name: "SF Pro Rounded",
      data: new Uint8Array(rounded).buffer,
      weight: 700 as const,
      style: "normal" as const,
    },
  ];
}

/** Explicit fonts keep Satori from substituting its bundled Noto Sans. */
export function loadWeightliftingOgFonts() {
  pending ??= readFonts().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
