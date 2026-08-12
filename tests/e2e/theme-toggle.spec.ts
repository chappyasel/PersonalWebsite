import { expect, test } from "@playwright/test";

test("primary click always changes the visible theme and System stays available", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();

  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  await page.goto("/manual");

  const root = page.locator("html");
  const toggle = page.locator("[data-theme-toggle]");

  await expect(root).toHaveClass(/dark/);

  await toggle.click();
  await expect(root).not.toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("light");

  await toggle.click();
  await expect(root).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("dark");

  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  await page.getByRole("radio", { name: "System" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("system");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).not.toHaveClass(/dark/);

  await context.close();
});
