import { type Locator, expect, test } from "@playwright/test";

test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

async function composite(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    const edge = (pseudo: string) => {
      const layer = getComputedStyle(node, pseudo);
      return {
        opacity: layer.opacity,
        blend: layer.mixBlendMode,
        shadow: layer.boxShadow,
        width: layer.getPropertyValue("--placard-edge-width"),
      };
    };
    return {
      fill: style.backgroundColor,
      filter: style.backdropFilter,
      opacity: style.opacity,
      shadow: style.boxShadow,
      border: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      weight: style.fontWeight,
      color: style.color,
      before: edge("::before"),
      after: edge("::after"),
    };
  });
}

// Computed rgb()/rgba() and color(srgb ...) serialize opaque alpha differently.
function colorAlpha(color: string): number {
  const match = /^(?:rgba?|color)\((.+)\)$/.exec(color);
  if (!match) throw new Error(`Unsupported computed color: ${color}`);
  const channels = match[1]!;
  const explicit = channels.includes("/")
    ? channels.split("/")[1]
    : channels.includes(",") && channels.split(",").length === 4
      ? channels.split(",")[3]
      : "1";
  const alpha = Number(explicit?.trim());
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
    throw new Error(`Invalid computed alpha: ${color}`);
  return alpha;
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} mobile pill retains native material with bold text and held feedback`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?quality=safety&harness=1#systems");
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.roomView === "live" &&
        window.__stacks?.state().controlsReady,
      null,
      { timeout: 90_000 },
    );
    await expect(page.locator("html")).toHaveClass(
      theme === "dark" ? /\bdark\b/ : /\blight\b/,
    );
    if (theme === "light")
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    const panel = page.locator("[data-stacks-mobile-panel][data-stacks-panel]");
    const sheet = page.locator(
      '[data-stacks-sheet-material][data-stacks-panel-unit="systems"]',
    );
    await expect(panel).toHaveAttribute("data-sheet", "peek");
    await expect(panel.locator("h2").first()).toHaveCSS("font-weight", "600");
    await expect
      .poll(async () => (await composite(sheet)).filter)
      .toBe(
        theme === "light"
          ? "blur(24px) saturate(1.5) brightness(0.62)"
          : "blur(32px) saturate(0.45) brightness(0.94)",
      );
    const reference = await composite(sheet);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-sheet.png`) });
    await panel.getByRole("button", { name: "Close", exact: true }).tap();
    const pill = page.locator("[data-stacks-chip]");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveCSS("opacity", "1");
    const actual = await composite(pill);
    expect(actual.weight).toBe("700");
    expect(actual.before.opacity).toBe("1");
    expect(actual.after.opacity).toBe("1");
    expect(actual.after).toEqual({ ...reference.after, opacity: "1" });
    expect(actual.before.blend).toBe(reference.before.blend);
    expect(actual.before.width).toBe(reference.before.width);
    // The light shell sets the same three --placard-edge-* values the dark
    // theme declares in globals.css, so both themes now bevel identically.
    const reflection = "rgba(255, 255, 255, 0.09)";
    const lowerEdge = "rgba(255, 255, 255, 0.09)";
    expect(actual.before.shadow).toBe(
      `${reflection} 2px 2px 0px 0px inset, ${lowerEdge} -2px -2px 0px 0px inset`,
    );
    // The sheet ends at the screen edge, so its bottom bevel has no Y inset.
    expect(reference.before.shadow).toBe(
      `${reflection} 2px 2px 0px 0px inset, ${lowerEdge} -2px 0px 0px 0px inset`,
    );
    if (theme === "light") {
      // The pill and the sheet are now cut from one material, which is what
      // the pale version could never manage: its pill needed a 0.56 white
      // fill to clear the meadow while the sheet sat at 0.28, and that gap
      // is what read as the pill being denser than the sheet it belonged to.
      expect(actual.fill).toBe("rgba(24, 32, 36, 0.38)");
      expect(actual.filter).toBe("blur(24px) saturate(1.5) brightness(0.62)");
      expect(reference.fill).toBe("rgba(24, 32, 36, 0.38)");
      expect(reference.after.opacity).toBe("1");
    } else {
      // The detached night pill retains its measured luminance floor. The
      // larger sheet instead has an upward shadow and no bottom perimeter.
      expect(actual.fill).toBe("rgba(255, 255, 255, 0.06)");
      expect(actual.filter).toBe("blur(32px) saturate(0.45) brightness(1.05)");
      expect(actual.after.opacity).toBe("1");
    }
    // The shared glass rule suppresses CSS borders. Pseudo-elements draw the
    // complete pill bevel; the sheet extends beyond the bottom edge instead.
    expect(actual.border).toBe("0px");
    expect(reference.border).toBe("0px");
    expect(actual.shadow).not.toBe("none");
    expect(reference.shadow).not.toBe("none");
    await page.screenshot({ path: testInfo.outputPath(`${theme}-pill.png`) });
    // Establish keyboard modality before programmatic focus, so this checks
    // a real :focus-visible state rather than pointer-acquired focus.
    await page.keyboard.press("Tab");
    await pill.focus();
    await expect(pill).toBeFocused();
    expect(await pill.evaluate((node) => node.matches(":focus-visible"))).toBe(
      true,
    );
    await expect(pill).toHaveCSS("outline-style", "solid");
    await expect(pill).toHaveCSS("outline-width", "2px");
    await expect(pill).toHaveCSS("outline-color", "rgb(255, 255, 255)");
    expect((await composite(pill)).shadow).toContain(
      "rgb(24, 24, 24) 0px 0px 0px 6px",
    );
    await page.screenshot({ path: testInfo.outputPath(`${theme}-focus.png`) });
    const box = await pill.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
      ],
    });
    // Native touch can defer :active until the compatibility mouse click.
    // Verify visible held feedback driven by the existing Motion press gesture.
    await expect(pill).toHaveAttribute("data-pressed", "");
    const pressed = await composite(pill);
    expect(pressed.fill).not.toBe(actual.fill);
    // Twelve percent ink gives a visible press, including color-mix's
    // premultiplied alpha arithmetic over the existing native fills.
    const alpha = colorAlpha(pressed.fill);
    const restAlpha = colorAlpha(actual.fill);
    expect(alpha).toBeCloseTo(restAlpha * 0.88 + 0.12, 3);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-press.png`) });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(panel).toHaveAttribute("data-sheet", "peek");

    // Check canceled-press presentation independently. The baseline already
    // prevents the first touchstart after a synthetic touchCancel; that input
    // behavior is recorded by the separate lifecycle differential probe.
    await panel.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(pill).toHaveCSS("opacity", "1");
    const cancelBox = await pill.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: cancelBox!.x + cancelBox!.width / 2,
          y: cancelBox!.y + cancelBox!.height / 2,
        },
      ],
    });
    await expect(pill).toHaveAttribute("data-pressed", "");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(pill).not.toHaveAttribute("data-pressed", "");
    await expect(pill).toHaveCSS("background-color", actual.fill);
    await expect(pill).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-cancel.png`) });
    await cdp.detach();
    await testInfo.attach("material-composite", {
      body: JSON.stringify({ theme, reference, actual, pressed }, null, 2),
      contentType: "application/json",
    });
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} paper pill shows held feedback and restores its resting material`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?quality=safety&harness=1#systems");
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.roomView === "live" &&
        window.__stacks?.state().controlsReady,
      null,
      { timeout: 90_000 },
    );
    await page.keyboard.press("Backquote");
    await page.getByRole("tab", { name: "Render", exact: true }).tap();
    const material = page.getByRole("combobox", {
      name: "Placard material",
      exact: true,
    });
    if (!(await material.isVisible()))
      await page
        .locator("summary")
        .filter({ hasText: "Scene effects and materials" })
        .tap();
    await material.selectOption({ label: "Opaque paper" });
    await expect(page.locator('[data-stacks-glass-mode="paper"]')).toHaveCount(
      1,
    );
    await page
      .getByRole("button", { name: "Close scene diagnostics", exact: true })
      .tap();
    await expect(page.locator("#stacks-scene-diagnostics")).toBeHidden();
    const panel = page.locator("[data-stacks-mobile-panel][data-stacks-panel]");
    await panel.getByRole("button", { name: "Close", exact: true }).tap();
    const pill = page.locator("[data-stacks-chip]");
    await expect(pill).toHaveCSS("opacity", "1");
    const rest = await composite(pill);
    const grain = await pill.evaluate(
      (node) => getComputedStyle(node).backgroundImage,
    );
    expect(rest.filter).toBe("none");
    expect(rest.weight).toBe("700");
    await page.keyboard.press("Tab");
    await pill.focus();
    await expect(pill).toHaveCSS("outline-width", "2px");
    expect((await composite(pill)).shadow).toContain(
      "rgb(24, 24, 24) 0px 0px 0px 6px",
    );
    await page.screenshot({
      path: testInfo.outputPath(`${theme}-paper-rest.png`),
    });
    const cdp = await page.context().newCDPSession(page);
    let held = false;
    const hold = async () => {
      const box = await pill.boundingBox();
      if (!box) throw new Error("Paper pill has no bounds");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
      held = true;
      await expect(pill).toHaveAttribute("data-pressed", "");
    };
    try {
      await hold();
      const pressed = await composite(pill);
      await testInfo.attach("paper-press-composite", {
        body: JSON.stringify({ theme, rest, pressed, grain }, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-paper-press.png`),
      });
      expect(pressed.fill).not.toBe(rest.fill);
      // Derive the press blend from the actual fill. This does not change
      // the existing light paper/native-selector specificity behavior.
      expect(colorAlpha(pressed.fill)).toBeCloseTo(
        colorAlpha(rest.fill) * 0.88 + 0.12,
        3,
      );
      expect(pressed.filter).toBe("none");
      expect(
        await pill.evaluate((node) => getComputedStyle(node).backgroundImage),
      ).toBe(grain);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      held = false;
      await expect(panel).toHaveAttribute("data-sheet", "peek");
      await panel.getByRole("button", { name: "Close", exact: true }).tap();
      await expect(pill).toHaveCSS("opacity", "1");
      await hold();
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
      held = false;
      await expect(pill).not.toHaveAttribute("data-pressed", "");
      await expect(pill).toHaveCSS("background-color", rest.fill);
      await expect(pill).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-paper-cancel.png`),
      });
      // The baseline next-tap-after-cancel limitation remains outside this test.
    } finally {
      // A failed held-state assertion must still release its injected touch.
      if (held)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
      await cdp.detach();
    }
  });
}

test("the light sheet ships its dark shell without being asked", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/?quality=safety&harness=1#systems");
  await page.waitForFunction(() => window.__stacks?.state().controlsReady);

  // No query parameter, no Diagnostics checkbox, no opt-in attribute: the
  // material is simply what the light sheet is made of now.
  expect(page.url()).not.toContain("mobile-glass");
  await expect(page.locator("[data-mobile-glass-prototype]")).toHaveCount(0);
  const sheet = page.locator(".stacks-sheet").first();
  const shell = await composite(sheet);
  expect(colorAlpha(shell.fill)).toBeCloseTo(0.38, 2);
  expect(shell.filter).toContain("blur(24px)");
  expect(shell.filter).toContain("saturate(1.5)");

  // The cards keep the room's dark ink on a light fill, and take it from a
  // flat veil rather than a second blur over the sheet's own output.
  const card = page
    .locator("[data-stacks-mobile-panel] [data-placard-surface]")
    .first();
  const plate = await composite(card);
  expect(colorAlpha(plate.fill)).toBeCloseTo(0.68, 2);
  expect(plate.filter).toBe("none");

  // Paper mode is the one thing that still outranks it.
  await page.evaluate(() => {
    document
      .querySelector("[data-stacks-glass-mode]")
      ?.setAttribute("data-stacks-glass-mode", "paper");
  });
  await expect.poll(async () => (await composite(sheet)).filter).toBe("none");
});
