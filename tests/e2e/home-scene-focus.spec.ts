import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  colorScheme: "light",
});

test("desktop details focus mode persists and guards the H shortcut", async ({
  page,
}) => {
  // SwiftShader can spend most of a minute compiling the full interaction
  // registry before this test reaches its first DOM click on a cold build.
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("stacks:details-hidden") === null)
      sessionStorage.setItem("stacks:details-hidden", "1");
  });
  await page.goto("/?nomeadow&nopostfx&harness=1", {
    waitUntil: "domcontentloaded",
  });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__stacks?.state();
          const interactions = state?.interactions as
            | Array<{ id: string; movable: boolean }>
            | undefined;
          return interactions?.filter((item) => item.movable).length ?? 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(76);
  const sceneInteractions = await page.evaluate(() => {
    const state = window.__stacks?.state();
    return (state?.interactions ?? []) as Array<{
      id: string;
      activation: "door" | "action" | "egg" | null;
    }>;
  });
  const sceneIds = sceneInteractions.map((item) => item.id);
  expect(sceneIds).toContain("grab:sailboat:musings");
  expect(sceneIds).toContain("grab:tj-medallion:about");
  expect(sceneIds).toContain("grab:plant:about-succulent");
  expect(sceneIds).toContain("grab:plant:about-large");
  expect(sceneIds).toContain("grab:phone:projects");
  expect(sceneIds).toContain("grab:notebook:projects");
  expect(sceneIds).toContain("grab:harmonica:talks");
  expect(sceneIds).toContain("grab:shaker:training-navy");
  expect(sceneIds).toContain("grab:shaker:training-amber");
  expect(sceneIds.some((id) => id.includes("ivy"))).toBe(false);
  for (const id of [
    "grab:shaker:training",
    "grab:shaker:training-navy",
    "grab:shaker:training-amber",
  ]) {
    expect(sceneInteractions.find((item) => item.id === id)?.activation).toBe(
      "egg",
    );
  }
  expect(
    sceneInteractions.find((item) => item.id === "grab:basketball")
      ?.activation,
  ).toBeNull();

  const dock = page.locator("[data-stacks-desktop-dock]");
  const show = page.getByRole("button", { name: "Show details" });
  await expect(dock).toHaveAttribute("data-hidden", "true");
  await expect(show).toBeVisible();
  await expect(show).toHaveAttribute("aria-expanded", "false");
  expect(
    await dock.evaluate((element) => ({
      inert: (element as HTMLElement).inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    })),
  ).toEqual({ inert: true, ariaHidden: "true" });

  await show.click();
  await expect(dock).toHaveAttribute("data-hidden", "false");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(dock).toHaveAttribute("data-hidden", "false");

  await page.keyboard.press("h");
  await expect(dock).toHaveAttribute("data-hidden", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(dock).toHaveAttribute("data-hidden", "true");

  const modifiedChordWasNotCanceled = await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "h",
        ctrlKey: true,
        cancelable: true,
      }),
    ),
  );
  expect(modifiedChordWasNotCanceled).toBe(true);
  await expect(dock).toHaveAttribute("data-hidden", "true");

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Shortcut guard probe");
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press("h");
  await expect(dock).toHaveAttribute("data-hidden", "true");
});
