import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";

import {
  DOCUMENT_TRANSITION_KEY,
  documentTransitionBootstrapScript,
} from "./documentBootstrap";

const windows: JSDOM[] = [];
function boot({
  native = true,
  to = "/manual",
  from = "/",
  enabled = true,
  stale = false,
  stored = true,
  reduced = false,
} = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><main>Document</main></body></html>",
    {
      url: `https://www.chappyasel.com${to}`,
      runScripts: "outside-only",
    },
  );
  windows.push(dom);
  const win = dom.window;
  Object.defineProperty(win, "matchMedia", {
    value: () => ({ matches: reduced }),
  });
  Object.defineProperty(win.performance, "getEntriesByType", {
    value: () => [],
  });
  Object.defineProperty(win, "CSS", { value: { supports: () => true } });
  if (native) Object.defineProperty(win, "onpagereveal", { value: null });
  const handoff = {
    from: `https://www.chappyasel.com${from}`,
    to: win.location.href,
    at: Date.now() - (stale ? 60_000 : 0),
    enabled,
    clip: "inset(100px 200px 300px 20px round 16px)",
    fallbackClip:
      "inset(100px calc(100% - 190px) calc(100% - 240px) 20px round 16px)",
    zoom: "translate(-20px, -30px) scale(1.2)",
  };
  if (stored)
    win.sessionStorage.setItem(
      DOCUMENT_TRANSITION_KEY,
      JSON.stringify(handoff),
    );
  win.eval(documentTransitionBootstrapScript);
  return { win, root: win.document.documentElement, handoff };
}
function transition() {
  let finish!: () => void;
  return {
    finished: new Promise<void>((resolve) => {
      finish = resolve;
    }),
    skipTransition: vi.fn(),
    finish: () => finish(),
  };
}
afterEach(() => windows.splice(0).forEach((dom) => dom.window.close()));

it("runs the exact head script and hands the source to native document snapshots", async () => {
  const { win, root, handoff } = boot();
  const native = transition();
  win.dispatchEvent(
    Object.assign(new win.Event("pagereveal"), { viewTransition: native }),
  );
  expect(root.dataset.routeDocument).toBe("native");
  expect(root.style.getPropertyValue("--document-origin-clip")).toBe(
    handoff.clip,
  );
  expect(win.sessionStorage.getItem(DOCUMENT_TRANSITION_KEY)).toBeNull();
  native.finish();
  await native.finished;
  await Promise.resolve();
  expect(root.dataset.routeDocument).toBeUndefined();
});

it("reveals full reading pages before hydration without native snapshots", () => {
  const { root, handoff } = boot({ native: false, to: "/books/behave" });
  expect(root.dataset.routeDocument).toBe("fallback");
  expect(root.style.getPropertyValue("--document-fallback-clip")).toBe(
    handoff.fallbackClip,
  );
});

it.each([
  { enabled: false },
  { reduced: true },
  { stale: true },
  { stored: false },
  { from: "/manual", to: "/manual#section" },
  { to: "/musings/feed.xml" },
  { to: "/books/api/export" },
  { to: "/projects" },
])("does not animate an ineligible arrival %j", (options) => {
  const { win, root } = boot(options);
  const native = transition();
  win.dispatchEvent(
    Object.assign(new win.Event("pagereveal"), { viewTransition: native }),
  );
  expect(native.skipTransition).toHaveBeenCalledOnce();
  expect(root.dataset.routeDocument).toBeUndefined();
});

it("carries Back/Forward across documents without depending on the incoming Navigation API", () => {
  const { win, root } = boot({ to: "/books/behave", stored: false });
  const native = transition();
  const to = "https://www.chappyasel.com/books";
  win.dispatchEvent(
    Object.assign(new win.Event("pageswap"), {
      viewTransition: native,
      activation: { from: { url: win.location.href }, entry: { url: to } },
    }),
  );
  expect(root.dataset.routeDocument).toBe("native");
  expect(
    JSON.parse(win.sessionStorage.getItem(DOCUMENT_TRANSITION_KEY)!),
  ).toMatchObject({
    from: win.location.href,
    to,
    enabled: true,
  });
});

it("honors the live off switch on departure", () => {
  const { win, root } = boot({ stored: false });
  root.dataset.pageTransitions = "off";
  const native = transition();
  win.dispatchEvent(
    Object.assign(new win.Event("pageswap"), {
      viewTransition: native,
      activation: {
        from: { url: win.location.href },
        entry: { url: "https://www.chappyasel.com/books" },
      },
    }),
  );
  expect(native.skipTransition).toHaveBeenCalledOnce();
  expect(root.dataset.routeDocument).toBeUndefined();
});

it("animates a bfcache restoration using its new handoff, not its original launch", () => {
  const { win, root, handoff } = boot({ stored: false });
  win.dispatchEvent(new win.Event("pagehide"));
  win.sessionStorage.setItem(
    DOCUMENT_TRANSITION_KEY,
    JSON.stringify({ ...handoff, from: "https://www.chappyasel.com/books" }),
  );
  win.dispatchEvent(
    Object.assign(new win.Event("pagereveal"), {
      viewTransition: transition(),
    }),
  );
  expect(root.dataset.routeDocument).toBe("native");
});
