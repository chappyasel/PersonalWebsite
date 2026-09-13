import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./RoomHomePage.tsx", import.meta.url),
  "utf8",
);
const stacksHomeSource = fs.readFileSync(
  new URL("./components/stacks/StacksHome.tsx", import.meta.url),
  "utf8",
);

describe("homepage first paint", () => {
  it("streams empty wood before data and keeps a native illustrated fallback", () => {
    expect(source).toContain("export default function RoomHomePage(");
    expect(source).toContain("async function HomePageContent({");
    expect(source).toContain("<RoomBootShell");
    expect(source).toContain("<RoomDocument");
    expect(source).not.toContain("FlatHome");
    expect(source).toContain("readingBookColors={readingBookColors}");
    expect(source).toContain("<React.Suspense fallback={null}>");
    // `indexOf` returns -1 for a needle that is not there, and -1 is less
    // than every real index — so this ordering check is only worth anything
    // if the needle is asserted present first.
    const handshake = source.indexOf("worldBootPrepaintScript()");
    const suspense = source.indexOf("<React.Suspense");
    expect(handshake).toBeGreaterThan(-1);
    expect(suspense).toBeGreaterThan(-1);
    expect(handshake).toBeLessThan(suspense);
  });

  it("keeps one initial shell across the streamed data handoff", () => {
    expect(source.match(/<RoomBootShell\b/g)).toHaveLength(1);
    expect(stacksHomeSource).not.toContain("<RoomBootShell");
  });

  it("keeps the streamed bridge on the same exact book projection", () => {
    expect(source).toContain("<BootReadingBooksBridge");
    expect(source.indexOf("<RoomBootShell")).toBeLessThan(
      source.indexOf("<React.Suspense"),
    );
    expect(source.indexOf("<BootReadingBooksBridge")).toBeGreaterThan(
      source.indexOf("async function HomePageContent({"),
    );
    expect(source).toContain("readingBooks={toBootReadingBooks(readingBooks)}");
    const books = fs.readFileSync(
      new URL(
        "./components/stacks/boot/homepageReadingBooks.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(books).toContain(
      "coverSrc: coverUrl ? proxiedBookCover(coverUrl, 256) : null",
    );
    expect(source).toContain("readingBookColors={readingBookColors}");
  });

  it("takes its boot decisions from the shared world-boot machine", () => {
    // Eligibility, the warm path, and the preload trigger used to be three
    // separate re-probes that could disagree. They now read one view.
    expect(stacksHomeSource).toContain(
      'import { useWorldBoot } from "./boot/useWorldBoot";',
    );
    expect(stacksHomeSource).not.toContain("browserCanUseStacksWorld");
    expect(stacksHomeSource).not.toContain("setWorldPhase");
    // Failure and readiness callbacks are stamped with the boot generation,
    // so a canvas torn down by a route change cannot demote the next world.
    expect(stacksHomeSource).toContain("worldBoot.scope(epoch)");
    expect(stacksHomeSource).not.toContain("setMode");
    expect(stacksHomeSource).toContain(
      "useStacks((state) => state.settledUnit)",
    );
  });

  it("generates the pre-paint handshake from the shared boot policy", () => {
    expect(source).toContain(
      'import { worldBootPrepaintScript } from "./components/stacks/boot/worldBootPrepaint";',
    );
    expect(source).toContain("worldBootPrepaintScript()");
    expect(source).toContain("data-room-illustration");
    // No hand-typed copy of the handshake constants survives in the route.
    expect(source).not.toContain("data-world");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("WORLD_BOOT_SCRIPT");
  });
});
