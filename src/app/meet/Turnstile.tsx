"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      appearance: "always" | "execute" | "interaction-only";
      size: "normal" | "flexible" | "compact";
      theme: "auto" | "light" | "dark";
      action?: string;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not load"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type TurnstileHandle = { reset: () => void };

/**
 * Cloudflare's person check. It stays invisible unless Cloudflare wants an
 * answer, and hands the page a single-use token; the page resets it after
 * every booking attempt so a retry gets a fresh one.
 */
export const Turnstile = forwardRef<
  TurnstileHandle,
  { siteKey: string; onToken: (token: string | null) => void }
>(function Turnstile({ siteKey, onToken }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const tokenHandler = useRef(onToken);
  useEffect(() => {
    tokenHandler.current = onToken;
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      tokenHandler.current(null);
      if (widget.current && window.turnstile) {
        window.turnstile.reset(widget.current);
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widget.current = api.render(container.current, {
          sitekey: siteKey,
          action: "meet",
          appearance: "interaction-only",
          size: "flexible",
          theme: "auto",
          callback: (token) => tokenHandler.current(token),
          "expired-callback": () => tokenHandler.current(null),
          "error-callback": () => tokenHandler.current(null),
        });
      })
      .catch(() => tokenHandler.current(null));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) {
        window.turnstile.remove(widget.current);
      }
      widget.current = null;
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-0 empty:hidden" />;
});
