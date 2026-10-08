import type { BrowserContext } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  type NativeElement,
  type NativeModalDriver,
  type NativeWindow,
  type OwnedBrowser,
  KNOWN_MODAL,
  NATIVE_MODAL_ACK_ENV,
  NATIVE_MODAL_ACK_TOKEN,
  NATIVE_MODAL_ENV,
  cuaDriverModalDriver,
  dismissOwnedModal,
  findOwnedModal,
  nativeModalEnabled,
  pickOwnedIdentity,
  resolveModalDriver,
  resolveOwnedBrowser,
  verifyModalGone,
} from "./native-modal";

const OWNED: OwnedBrowser = {
  pid: 900,
  appName: "Google Chrome for Testing",
  windowIds: [10],
};

function win(overrides: Partial<NativeWindow> = {}): NativeWindow {
  return {
    window_id: 11,
    pid: OWNED.pid,
    app_name: OWNED.appName,
    title: KNOWN_MODAL.title,
    ...overrides,
  };
}

const browserWindow = win({ window_id: 10, title: "Google Takeout" });

function okButton(overrides: Partial<NativeElement> = {}): NativeElement {
  return {
    element_token: "s0000002a:14",
    role: "AXButton",
    label: "OK",
    ...overrides,
  };
}

type Script = {
  windows: NativeWindow[][];
  elements?: NativeElement[];
};

function driver(script: Script): NativeModalDriver & {
  calls: string[];
  click: ReturnType<typeof vi.fn>;
} {
  const calls: string[] = [];
  let listed = 0;
  const click = vi.fn(async (input: { pid: number; elementToken: string }) => {
    calls.push(`click:${input.pid}:${input.elementToken}`);
  });
  return {
    calls,
    click,
    listWindows: async (pid) => {
      calls.push(`listWindows:${pid}`);
      const frame = script.windows[Math.min(listed, script.windows.length - 1)];
      listed += 1;
      return frame ?? [];
    },
    windowElements: async ({ pid, windowId }) => {
      calls.push(`windowElements:${pid}:${windowId}`);
      return script.elements ?? [okButton()];
    },
  };
}

describe("findOwnedModal", () => {
  it("matches only the exact modal on the window of the browser we launched", () => {
    expect(findOwnedModal([browserWindow, win()], OWNED)).toEqual({
      kind: "found",
      window: win(),
    });
  });

  it("ignores the same modal belonging to another Chrome process", () => {
    expect(findOwnedModal([browserWindow, win({ pid: 777 })], OWNED)).toEqual({
      kind: "foreign_modal",
    });
  });

  it("ignores a window whose title merely resembles the known modal", () => {
    for (const title of [
      "No passkeys available for this site",
      "no passkeys available",
      "No passkeys available ",
      "Use a passkey",
    ]) {
      expect(findOwnedModal([browserWindow, win({ title })], OWNED)).toEqual({
        kind: "absent",
      });
    }
  });

  it("ignores a matching title from another application", () => {
    for (const app_name of ["Safari", "Google Chrome", "Chromium"]) {
      // Playwright's build is a different application from the everyday Chrome,
      // so the user's own browser showing this dialog is not ours to touch.
      expect(findOwnedModal([browserWindow, win({ app_name })], OWNED)).toEqual({
        kind: "absent",
      });
    }
  });

  it("refuses to pick between two identical candidates", () => {
    expect(
      findOwnedModal([browserWindow, win(), win({ window_id: 12 })], OWNED),
    ).toEqual({ kind: "ambiguous" });
  });

  it("refuses to treat a pre-existing window of ours as the modal", () => {
    expect(
      findOwnedModal([win({ window_id: 10 })], OWNED),
    ).toEqual({ kind: "ambiguous" });
  });

  it("reports absence when the browser's own window is no longer listed", () => {
    expect(findOwnedModal([win()], OWNED)).toEqual({ kind: "browser_gone" });
  });

  it("reports absence when nothing is listed at all", () => {
    expect(findOwnedModal([], OWNED)).toEqual({ kind: "browser_gone" });
  });
});

describe("dismissOwnedModal", () => {
  it("clicks the exact dismiss control, then proves the window is gone", async () => {
    const d = driver({ windows: [[browserWindow, win()], [browserWindow]] });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "dismissed",
      windowId: 11,
    });
    expect(d.calls).toEqual([
      "listWindows:900",
      "windowElements:900:11",
      "click:900:s0000002a:14",
      "listWindows:900",
    ]);
  });

  it("does not claim a dismissal when the modal comes back under a new id", async () => {
    const d = driver({
      windows: [
        [browserWindow, win()],
        [browserWindow, win({ window_id: 99 })],
      ],
    });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "dismiss_unconfirmed",
    });
  });

  it("calls a vanished browser a crash, not a dismissal", async () => {
    const d = driver({ windows: [[browserWindow, win()], []] });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "browser_gone",
    });
  });

  it("does not claim a dismissal while the modal is still listed", async () => {
    const d = driver({
      windows: [
        [browserWindow, win()],
        [browserWindow, win()],
      ],
    });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "dismiss_unconfirmed",
    });
  });

  it("reports no modal without clicking anything", async () => {
    const d = driver({ windows: [[browserWindow]] });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "not_present",
    });
    expect(d.click).not.toHaveBeenCalled();
  });

  it("fails closed on ambiguous native evidence", async () => {
    const d = driver({ windows: [[browserWindow, win(), win({ window_id: 12 })]] });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "ambiguous_native_evidence",
    });
    expect(d.click).not.toHaveBeenCalled();
  });

  it("fails closed on a modal that is not bound to our browser", async () => {
    const d = driver({ windows: [[browserWindow, win({ pid: 777 })]] });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "foreign_modal",
    });
    expect(d.click).not.toHaveBeenCalled();
  });

  it("will not press a control whose label is not one it knows", async () => {
    const d = driver({
      windows: [[browserWindow, win()]],
      elements: [okButton({ label: "Use another device" })],
    });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "dismiss_control_missing",
    });
    expect(d.click).not.toHaveBeenCalled();
  });

  it("will not press a non-button that happens to be labelled OK", async () => {
    const d = driver({
      windows: [[browserWindow, win()]],
      elements: [okButton({ role: "AXStaticText" })],
    });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "dismiss_control_missing",
    });
  });

  it("refuses to choose between two identical dismiss controls", async () => {
    const d = driver({
      windows: [[browserWindow, win()]],
      elements: [okButton(), okButton({ element_token: "s0000002a:15" })],
    });
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "ambiguous_native_evidence",
    });
    expect(d.click).not.toHaveBeenCalled();
  });

  it("reports a driver error rather than guessing what happened", async () => {
    const d = driver({ windows: [[browserWindow, win()]] });
    d.click.mockRejectedValue(new Error("accessibility denied"));
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "driver_error",
    });
  });

  it("reports a driver error when the window list cannot be read", async () => {
    await expect(
      dismissOwnedModal(
        {
          listWindows: async () => {
            throw new Error("daemon unavailable");
          },
          windowElements: async () => [],
          click: async () => undefined,
        },
        OWNED,
      ),
    ).resolves.toEqual({ kind: "driver_error" });
  });
});

describe("verifyModalGone", () => {
  it("needs our browser present and no modal of ours at all", () => {
    expect(verifyModalGone([browserWindow], OWNED)).toBe("dismissed");
    expect(verifyModalGone([browserWindow, win()], OWNED)).toBe("still_present");
    expect(verifyModalGone([browserWindow, win({ window_id: 99 })], OWNED)).toBe(
      "still_present",
    );
    expect(verifyModalGone([], OWNED)).toBe("browser_gone");
    expect(verifyModalGone([win()], OWNED)).toBe("browser_gone");
    expect(
      verifyModalGone([browserWindow, win(), win({ window_id: 12 })], OWNED),
    ).toBe("ambiguous");
  });

  it("ignores another process's modal when judging ours", () => {
    expect(verifyModalGone([browserWindow, win({ pid: 777 })], OWNED)).toBe(
      "dismissed",
    );
  });
});

describe("enablement", () => {
  it("stays off unless both the switch and the operator acknowledgement are set", () => {
    expect(nativeModalEnabled({})).toBe(false);
    expect(nativeModalEnabled({ [NATIVE_MODAL_ENV]: "1" })).toBe(false);
    expect(nativeModalEnabled({ [NATIVE_MODAL_ACK_ENV]: NATIVE_MODAL_ACK_TOKEN })).toBe(
      false,
    );
    expect(
      nativeModalEnabled({
        [NATIVE_MODAL_ENV]: "1",
        [NATIVE_MODAL_ACK_ENV]: "yes",
      }),
    ).toBe(false);
    expect(
      nativeModalEnabled({
        [NATIVE_MODAL_ENV]: "1",
        [NATIVE_MODAL_ACK_ENV]: NATIVE_MODAL_ACK_TOKEN,
      }),
    ).toBe(true);
  });

  it("resolves to no driver by default, so the route blocks instead of acting", () => {
    expect(resolveModalDriver({})).toBeNull();
    expect(
      resolveModalDriver({
        [NATIVE_MODAL_ENV]: "1",
        [NATIVE_MODAL_ACK_ENV]: NATIVE_MODAL_ACK_TOKEN,
      }),
    ).not.toBeNull();
  });
});

describe("pickOwnedIdentity", () => {
  it("takes the application name from the pid's own windows", () => {
    expect(pickOwnedIdentity(900, [browserWindow, win()])).toEqual({
      pid: 900,
      appName: "Google Chrome for Testing",
      windowIds: [10, 11],
    });
  });

  it("ignores other processes' windows", () => {
    expect(
      pickOwnedIdentity(900, [browserWindow, win({ pid: 77, window_id: 70 })]),
    ).toMatchObject({ windowIds: [10] });
  });

  it("refuses when the pid has no windows to vouch for it", () => {
    expect(pickOwnedIdentity(900, [])).toBeNull();
    expect(pickOwnedIdentity(900, [win({ pid: 77 })])).toBeNull();
  });

  it("refuses an application it does not know", () => {
    expect(
      pickOwnedIdentity(900, [browserWindow, win({ app_name: "Safari" })]),
    ).toBeNull();
    expect(
      pickOwnedIdentity(900, [{ ...browserWindow, app_name: "Finder" }]),
    ).toBeNull();
  });

  it("accepts each known browser on its own", () => {
    for (const app of ["Google Chrome for Testing", "Google Chrome", "Chromium"]) {
      expect(
        pickOwnedIdentity(900, [{ ...browserWindow, app_name: app }]),
        app,
      ).toMatchObject({ appName: app });
    }
  });
});

describe("resolveOwnedBrowser", () => {
  /** A stand-in for a Playwright context; only `browser()` is reached. */
  const cdpContext = (pid: number | null) =>
    ({
      browser: () => ({
        newBrowserCDPSession: async () => ({
          send: async () => ({
            processInfo: [
              ...(pid === null ? [] : [{ type: "browser", id: pid }]),
              { type: "renderer", id: 999 },
            ],
          }),
          detach: async () => undefined,
        }),
      }),
    }) as unknown as BrowserContext;

  const driver = (windows: NativeWindow[]): NativeModalDriver => ({
    listWindows: async () => windows,
    windowElements: async () => [],
    click: async () => undefined,
  });

  it("binds the live browser pid to its windows", async () => {
    await expect(
      resolveOwnedBrowser({
        context: cdpContext(900),
        driver: driver([browserWindow]),
      }),
    ).resolves.toEqual({
      pid: 900,
      appName: "Google Chrome for Testing",
      windowIds: [10],
    });
  });

  it("reports unavailable when the browser cannot be identified", async () => {
    await expect(
      resolveOwnedBrowser({ context: cdpContext(null), driver: driver([browserWindow]) }),
    ).resolves.toBeNull();
    await expect(
      resolveOwnedBrowser({
        context: { browser: () => null } as unknown as BrowserContext,
        driver: driver([browserWindow]),
      }),
    ).resolves.toBeNull();
  });

  it("reports unavailable when the driver cannot list the windows", async () => {
    await expect(
      resolveOwnedBrowser({
        context: cdpContext(900),
        driver: {
          listWindows: async () => {
            throw new Error("daemon unavailable");
          },
          windowElements: async () => [],
          click: async () => undefined,
        },
      }),
    ).resolves.toBeNull();
  });
});

describe("the cua-driver 0.22 adapter", () => {
  const listWindowsPayload = JSON.stringify({
    current_space_id: 3,
    windows: [
      {
        window_id: 10,
        pid: 900,
        app_name: "Google Chrome for Testing",
        title: "Google Takeout",
      },
      {
        window_id: 11,
        pid: 900,
        app_name: "Google Chrome for Testing",
        title: KNOWN_MODAL.title,
      },
    ],
  });
  const windowStatePayload = JSON.stringify({
    elements: [
      { element_token: "s0000002a:14", role: "AXButton", label: "OK" },
      {
        element_token: "s0000002a:15",
        role: "AXStaticText",
        label: "No passkeys available",
      },
    ],
  });

  const SESSION = "youtube-takeout-attempt-1";

  function adapterWith(
    run: (tool: string, payload: Record<string, unknown>) => Promise<string>,
  ) {
    return cuaDriverModalDriver({ run, session: SESSION });
  }

  it("reads windows and elements, with screenshots explicitly turned off", async () => {
    const run = vi.fn(async (tool: string) =>
      tool === "list_windows" ? listWindowsPayload : windowStatePayload,
    );
    const adapter = adapterWith(run);
    expect(await adapter.listWindows(900)).toHaveLength(2);
    expect(await adapter.windowElements({ pid: 900, windowId: 11 })).toHaveLength(2);
    // One stable session label on the calls whose schema accepts it, and none
    // on list_windows, which rejects unknown properties.
    expect(run.mock.calls).toEqual([
      ["list_windows", { pid: 900 }],
      [
        "get_window_state",
        {
          pid: 900,
          window_id: 11,
          include_screenshot: false,
          session: SESSION,
        },
      ],
    ]);
  });

  it("presses in the background, as an accessibility action", async () => {
    const run = vi.fn(async () => "{}");
    await adapterWith(run).click({
      pid: 900,
      elementToken: "s0000002a:14",
      windowId: 11,
    });
    expect(run.mock.calls).toEqual([
      [
        "click",
        {
          pid: 900,
          element_token: "s0000002a:14",
          window_id: 11,
          action: "press",
          delivery_mode: "background",
          session: SESSION,
        },
      ],
    ]);
  });

  it("keeps one session label across separately spawned calls", async () => {
    const payloads: Record<string, unknown>[] = [];
    const adapter = adapterWith(async (tool, payload) => {
      payloads.push({ tool, ...payload });
      if (tool === "list_windows") return listWindowsPayload;
      if (tool === "get_window_state") return windowStatePayload;
      return "{}";
    });
    await adapter.windowElements({ pid: 900, windowId: 11 });
    await adapter.click({ pid: 900, elementToken: "s0000002a:14", windowId: 11 });
    expect(payloads.map((p) => p.session)).toEqual([SESSION, SESSION]);
  });

  it("omits the session when no attempt label was given", async () => {
    const payloads: Record<string, unknown>[] = [];
    const adapter = cuaDriverModalDriver({
      run: async (tool, payload) => {
        payloads.push({ tool, ...payload });
        return tool === "get_window_state" ? windowStatePayload : "{}";
      },
    });
    await adapter.windowElements({ pid: 900, windowId: 11 });
    expect(payloads[0]).not.toHaveProperty("session");
  });

  it("never asks to focus the app, grant permissions, or escalate a session", async () => {
    const seen: string[] = [];
    const adapter = adapterWith(async (tool) => {
      seen.push(tool);
      if (tool === "list_windows") return listWindowsPayload;
      if (tool === "get_window_state") return windowStatePayload;
      return "{}";
    });
    await adapter.listWindows(900);
    await adapter.windowElements({ pid: 900, windowId: 11 });
    await adapter.click({ pid: 900, elementToken: "s0000002a:14" });
    expect(seen).toEqual(["list_windows", "get_window_state", "click"]);
    for (const forbidden of [
      "bring_to_front",
      "launch_app",
      "escalate_session",
      "start_session",
      "set_config",
      "get_desktop_state",
      "zoom",
      "start_recording",
      "hotkey",
      "type_text",
      "set_value",
      "kill_app",
    ]) {
      expect(seen).not.toContain(forbidden);
    }
  });

  it("treats unparsable driver output as no evidence at all", async () => {
    for (const output of ["not json", "[]", "null", '"ok"']) {
      await expect(adapterWith(async () => output).listWindows(900)).rejects.toThrow(
        "native_driver_unparsable",
      );
    }
  });

  it("rejects an error-shaped reply instead of reading it as no windows", async () => {
    for (const payload of [
      { error: "accessibility denied" },
      { isError: true, content: "denied" },
      { is_error: true },
      { windows: [], partial: true },
      { windows: [], truncated: true },
      { windows: [], degraded: true },
      { windows: [], incomplete: true },
    ]) {
      await expect(
        adapterWith(async () => JSON.stringify(payload)).listWindows(900),
      ).rejects.toThrow("native_driver_degraded");
    }
  });

  it("rejects a reply with no windows key, which is not an empty list", async () => {
    await expect(
      adapterWith(async () => JSON.stringify({ current_space_id: 3 })).listWindows(900),
    ).rejects.toThrow("native_driver_unparsable");
  });

  it("accepts a genuinely empty window list", async () => {
    const adapter = adapterWith(async () =>
      JSON.stringify({ current_space_id: 3, windows: [] }),
    );
    expect(await adapter.listWindows(900)).toEqual([]);
  });

  it("rejects the whole reply over one malformed row", async () => {
    await expect(
      adapterWith(async () =>
        JSON.stringify({
          windows: [
            {
              window_id: 11,
              pid: 900,
              app_name: "Google Chrome for Testing",
              title: KNOWN_MODAL.title,
            },
            { window_id: null, pid: 900, app_name: "Google Chrome for Testing", title: "x" },
          ],
        }),
      ).listWindows(900),
    ).rejects.toThrow("native_driver_unparsable");

    await expect(
      adapterWith(async () =>
        JSON.stringify({
          elements: [
            { element_token: "s1", role: "AXButton", label: "OK" },
            { element_token: "s2", role: "AXButton" },
          ],
        }),
      ).windowElements({ pid: 900, windowId: 11 }),
    ).rejects.toThrow("native_driver_unparsable");
  });

  it("reads a structuredContent envelope, and its error flags too", async () => {
    const adapter = adapterWith(async () =>
      JSON.stringify({ structuredContent: { windows: [] } }),
    );
    expect(await adapter.listWindows(900)).toEqual([]);
    await expect(
      adapterWith(async () =>
        JSON.stringify({ structuredContent: { windows: [], partial: true } }),
      ).listWindows(900),
    ).rejects.toThrow("native_driver_degraded");
  });

  it("fails the press when the driver reports the action failed", async () => {
    await expect(
      adapterWith(async () => JSON.stringify({ error: "no such element" })).click({
        pid: 900,
        elementToken: "s0000002a:14",
      }),
    ).rejects.toThrow("native_driver_degraded");
  });

  it("surfaces a failed press as a driver error, never as a dismissal", async () => {
    let listed = 0;
    const d: NativeModalDriver = {
      listWindows: async () => {
        listed += 1;
        return [browserWindow, win()];
      },
      windowElements: async () => [okButton()],
      click: async () => {
        throw new Error("native_driver_degraded");
      },
    };
    await expect(dismissOwnedModal(d, OWNED)).resolves.toEqual({
      kind: "driver_error",
    });
    expect(listed).toBe(1);
  });
});
