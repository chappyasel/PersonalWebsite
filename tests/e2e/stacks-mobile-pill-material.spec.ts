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

for (const theme of ["light", "dark"] as const) {
  test(`${theme} mobile pill retains native material with semibold and held feedback`, async ({
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
          ? "blur(42px) saturate(0.28) brightness(1.18)"
          : "blur(32px) saturate(0.45) brightness(0.94)",
      );
    const reference = await composite(sheet);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-sheet.png`) });
    await panel.getByRole("button", { name: "Close", exact: true }).tap();
    const pill = page.locator("[data-stacks-chip]");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveCSS("opacity", "1");
    const actual = await composite(pill);
    expect(actual.weight).toBe("600");
    expect(actual.before.opacity).toBe("1");
    expect(actual.after.opacity).toBe("1");
    expect(actual.after).toEqual({ ...reference.after, opacity: "1" });
    expect(actual.before.blend).toBe(reference.before.blend);
    expect(actual.before.width).toBe(reference.before.width);
    const reflection =
      theme === "light"
        ? "rgba(255, 255, 255, 0.28)"
        : "rgba(255, 255, 255, 0.09)";
    const lowerEdge =
      theme === "light" ? "rgba(0, 0, 0, 0.18)" : "rgba(255, 255, 255, 0.09)";
    expect(actual.before.shadow).toBe(
      `${reflection} 2px 2px 0px 0px inset, ${lowerEdge} -2px -2px 0px 0px inset`,
    );
    // The sheet ends at the screen edge, so its bottom bevel has no Y inset.
    expect(reference.before.shadow).toBe(
      `${reflection} 2px 2px 0px 0px inset, ${lowerEdge} -2px 0px 0px 0px inset`,
    );
    if (theme === "light") {
      // Material parity is still under investigation. Keep the original
      // contrast floor until a complete composite earns visual acceptance.
      expect(actual.fill).toBe("rgba(255, 255, 255, 0.56)");
      expect(actual.filter).toBe("blur(42px) saturate(0.28) brightness(1.34)");
      expect(reference.fill).toBe("rgba(255, 255, 255, 0.28)");
      expect(reference.after.opacity).toBe("0.5");
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
    const alpha = Number(/[/,]\s*([\d.]+)\)$/.exec(pressed.fill)?.[1]);
    const restAlpha = Number(/[/,]\s*([\d.]+)\)$/.exec(actual.fill)?.[1]);
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
