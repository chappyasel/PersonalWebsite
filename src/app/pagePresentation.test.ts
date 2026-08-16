import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const stacksHomeSource = fs.readFileSync(
  new URL("./components/stacks/StacksHome.tsx", import.meta.url),
  "utf8",
);

describe("homepage first paint", () => {
  it("streams the boot vignette before homepage data has resolved", () => {
    expect(source).toContain("export default function HomePage()");
    expect(source).toContain("async function HomePageContent()");
    expect(source).toContain("<BootScreen />");
    expect(source).toContain("<React.Suspense fallback={null}>");
    expect(
      source.indexOf(
        "<script dangerouslySetInnerHTML={{ __html: WORLD_BOOT_SCRIPT }} />",
      ),
    ).toBeLessThan(source.indexOf("<React.Suspense"));
  });

  it("keeps one boot-screen owner across the streamed data handoff", () => {
    expect(source.match(/<BootScreen\b/g)).toHaveLength(1);
    expect(stacksHomeSource).not.toContain("<BootScreen");
  });
});
