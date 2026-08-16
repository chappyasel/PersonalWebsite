import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
});

test("door labels reopen after the first hover", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    sessionStorage.setItem("stacks-webgl-v1", "1");
  });
  await page.goto(
    process.env.DOOR_LABEL_TEST_URL ?? "/?nomeadow&nopostfx&harness=1",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForFunction(() => {
    const interactions = window.__stacks?.state().interactions as
      | Array<{ id: string }>
      | undefined;
    return interactions?.some(
      (entry) => entry.id === "grab:photo:about-profile-full-v8",
    );
  });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const interactions = window.__stacks?.state().interactions as
            | Array<{ id: string; activation: string | null }>
            | undefined;
          return interactions
            ?.filter((entry) =>
              ["grab:ai-collective-mark", "grab:tj-medallion:about"].includes(
                entry.id,
              ),
            )
            .map((entry) => [entry.id, entry.activation]);
        }),
      { timeout: 30_000 },
    )
    .toEqual([
      ["grab:ai-collective-mark", "door"],
      ["grab:tj-medallion:about", "door"],
    ]);

  const label = page.locator("[data-stacks-door-label]");
  const readingId = await page.evaluate(() => {
    const interactions = window.__stacks?.state().interactions as
      | Array<{
          id: string;
          activeUnits: number[];
          activation: string | null;
        }>
      | undefined;
    return interactions?.find(
      (entry) =>
        entry.id.startsWith("grab:reading:") &&
        entry.activeUnits.includes(0) &&
        entry.activation === "action",
    )?.id;
  });
  expect(readingId).toBeTruthy();
  if (!readingId) throw new Error("missing About reading-book action");
  const hoverPortrait = () =>
    page.evaluate(() =>
      window.__stacks?.hover("grab:photo:about-profile-full-v8"),
    );
  const leave = () => page.evaluate(() => window.__stacks?.hover(null));

  await hoverPortrait();
  await expect(label).toContainText("Open Instagram", { timeout: 5_000 });
  await expect(label.locator('[role="status"]')).toHaveClass(/opacity-100/);
  await expect(label).toHaveAttribute("data-anchor-source", "object");

  for (const [id, text] of [
    ["grab:ai-collective-mark", "Visit The AI Collective"],
    ["grab:tj-medallion:about", "Visit TJHSST"],
  ] as const) {
    await page.evaluate((hoverId) => window.__stacks?.hover(hoverId), id);
    await expect
      .poll(() => page.evaluate(() => window.__stacks?.state().hovered))
      .toBe(id);
    await expect(label).toContainText(text, { timeout: 5_000 });
    await expect(label.locator('[role="status"]')).toHaveClass(/opacity-100/);
    await expect(label).toHaveAttribute("data-anchor-source", "object");
  }

  await hoverPortrait();
  await expect(label).toContainText("Open Instagram", { timeout: 5_000 });
  await expect(label.locator('[role="status"]')).toHaveClass(/opacity-100/);

  await page.evaluate((id) => window.__stacks?.hover(id), readingId);
  await page.waitForTimeout(50);
  await expect(label).toContainText("Open Instagram");
  await expect(label.locator('[role="status"]')).toHaveClass(/opacity-0/);
  await expect(label).toContainText(/^Read /, { timeout: 5_000 });
  await expect(label.locator('[role="status"]')).toHaveClass(/opacity-100/);
  await expect(label).toHaveAttribute("data-anchor-source", "object");

  await leave();
  await page.waitForTimeout(50);
  await expect(label.locator('[role="status"]')).toHaveClass(/opacity-0/);
  await expect
    .poll(() => page.evaluate(() => window.__stacks?.state().hovered))
    .toBeNull();
  await expect(label).toHaveCount(0);

  await hoverPortrait();
  await expect
    .poll(() => page.evaluate(() => window.__stacks?.state().hovered))
    .toBe("grab:photo:about-profile-full-v8");
  await expect(label).toContainText("Open Instagram", { timeout: 5_000 });
  await expect(label.locator('[role="status"]')).toHaveClass(/opacity-100/);
});
