import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
});

test("keeps the side pill visible after illustrated entry and section changes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // The illustrated room uses the same nav and compiled entrance reset as
  // 3D. Keep WebGL out of this CSS regression test via the Save-Data path.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
  });
  await page.goto("/?nomeadow&nopostfx", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator(".stacks-world-shell[data-illustrated-entry][data-revealed]"),
  ).toBeVisible({ timeout: 60_000 });

  const rail = page.locator(".stacks-unit-rail-desktop");
  const pill = rail.locator("[data-stacks-rail-indicator]");
  // A navigation click completes the artwork entrance, just as it does for
  // visitors who start exploring immediately.
  await rail.getByRole("button", { name: "About", exact: true }).click();
  const expectVisiblePill = async () => {
    await expect(pill).toBeVisible();
    await expect
      .poll(async () => {
        const box = await pill.boundingBox();
        return box
          ? Math.abs(box.width - 4) + Math.abs(box.height - 20)
          : Infinity;
      })
      .toBeLessThan(0.5);
    await expect
      .poll(async () => {
        const marker = await pill.boundingBox();
        const selected = await rail
          .locator('[aria-current="page"]')
          .boundingBox();
        return marker && selected
          ? Math.abs(
              marker.y + marker.height / 2 - selected.y - selected.height / 2,
            )
          : Infinity;
      })
      .toBeLessThan(1);
  };

  await expectVisiblePill();
  await expect(rail).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("straight-nav.png") });
  for (const label of ["Book Notes", "Talks", "About"]) {
    await rail.getByRole("button", { name: label, exact: true }).click();
    await expect(
      rail.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expectVisiblePill();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await rail.getByRole("button", { name: "Systems", exact: true }).click();
  await expect(
    rail.getByRole("button", { name: "Systems", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expectVisiblePill();
  // The Golf stop uses the original round, dimpled marker, then returns to
  // the vertical pill when another section is selected.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?nomeadow&nopostfx#golf", {
    waitUntil: "domcontentloaded",
  });
  await expect(pill).toBeVisible();
  await page.keyboard.press("Shift");
  await expect(
    page.locator('.stacks-world-shell[data-room-entrance="complete"]'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(pill).toHaveAttribute("data-stacks-golf-ball", "true");
  await expect(pill).toBeVisible();
  await expect
    .poll(async () => {
      const box = await pill.boundingBox();
      return box
        ? Math.abs(box.width - 12) + Math.abs(box.height - 12)
        : Infinity;
    })
    .toBeLessThan(0.5);
  expect(
    await pill.evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain("radial-gradient");
  await expect(rail).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: test.info().outputPath("golf-ball-marker.png"),
  });
  await rail.getByRole("button", { name: "About", exact: true }).click();
  await expect(pill).not.toHaveAttribute("data-stacks-golf-ball");
  await expectVisiblePill();
});
