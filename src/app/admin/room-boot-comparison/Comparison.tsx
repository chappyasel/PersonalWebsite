"use client";

import { BootScreenArtwork } from "../../components/stacks/dom/BootScreen";
import type { BootReadingBooksSnapshot } from "../../components/stacks/dom/bootReadingBooks";
import { PALETTES } from "../../components/stacks/theme";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";

import "./comparison.css";
import type { CaptureCase, Summary, Unit } from "./data";

const UNIT_LABELS: Record<Unit, string> = {
  projects: "Projects",
  weightlifting: "Weightlifting",
  books: "Books",
  systems: "Systems",
  musings: "Musings",
  talks: "Talks",
};

export function Comparison({
  initialSummary,
  reading,
}: {
  initialSummary: Summary;
  reading: BootReadingBooksSnapshot;
}) {
  const [unit, setUnit] = useState<Unit>("weightlifting");
  const [dark, setDark] = useState(false);
  const [phone, setPhone] = useState(false);
  const [about, setAbout] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [svg, setSvg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const drawing = useRef<HTMLDivElement>(null);
  const capture: CaptureCase = `${dark ? "dark" : "light"}-${phone ? "phone" : "desktop"}`;
  const current = summary[unit][capture];

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("unit");
    if (requested && Object.hasOwn(UNIT_LABELS, requested))
      setUnit(requested as Unit);
    setAbout(requested === "about");
    setDark(query.get("theme") === "dark");
    setPhone(
      query.has("view")
        ? query.get("view") === "phone"
        : window.innerWidth < 600,
    );
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const original = root.classList.contains("dark");
    const apply = () => {
      if (root.classList.contains("dark") !== dark)
        root.classList.toggle("dark", dark);
    };
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    apply();
    return () => {
      observer.disconnect();
      root.classList.toggle("dark", original);
    };
  }, [dark]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetch("/admin/room-boot-comparison/asset?summary=1")
        .then((response) => response.json())
        .then((next: Summary) => setSummary(next))
        .catch(() => {
          /* Keep the last available capture while generation runs. */
        });
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSvg(null);
    setLoaded(false);
    if (!current.ready || about) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      unit,
      case: capture,
      file: "artwork.svg",
      v: String(current.version),
    });
    void fetch(`/admin/room-boot-comparison/asset?${query}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Capture unavailable");
        return response.text();
      })
      .then((value) => setSvg(value))
      .catch(() => {
        if (!controller.signal.aborted) setSvg(null);
      });
    return () => controller.abort();
  }, [about, capture, current.ready, current.version, unit]);

  useEffect(() => {
    if (!svg) return;
    let disposed = false;
    const images = [...(drawing.current?.querySelectorAll("image") ?? [])];
    void Promise.all(
      images.map(
        (element) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = reject;
            image.src = element.getAttribute("href") ?? "";
          }),
      ),
    )
      .then(() => {
        if (!disposed) setLoaded(true);
      })
      .catch(() => {
        if (!disposed) setLoaded(false);
      });
    return () => {
      disposed = true;
    };
  }, [svg]);

  function select(next: {
    unit?: Unit | "about";
    dark?: boolean;
    phone?: boolean;
  }) {
    const nextUnit = next.unit ?? (about ? "about" : unit);
    const nextDark = next.dark ?? dark;
    const nextPhone = next.phone ?? phone;
    setAbout(nextUnit === "about");
    if (nextUnit !== "about") setUnit(nextUnit);
    setDark(nextDark);
    setPhone(nextPhone);
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      unit: nextUnit,
      theme: nextDark ? "dark" : "light",
      view: nextPhone ? "phone" : "desktop",
    }).toString();
    window.history.replaceState(null, "", url);
  }

  function replay() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const groups = [
      ...(drawing.current?.querySelectorAll<SVGGElement>("[data-part]") ?? []),
    ];
    groups.forEach((group, index) => {
      group.getAnimations().forEach((animation) => animation.cancel());
      group.animate(
        [
          { opacity: 0, transform: "translateY(5px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: index === 0 ? 480 : 360,
          delay:
            index === 0
              ? 0
              : 180 + (index / Math.max(groups.length - 1, 1)) * 960,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "backwards",
        },
      );
    });
  }

  const palette = dark ? PALETTES.dark : PALETTES.light;
  const style = {
    "--background": dark ? "24 10% 6%" : "60 9% 98%",
    "--foreground": dark ? "24 6% 83%" : "25 7% 24%",
    "--room-drawing-width": `${current.drawingWidth}px`,
    ...Object.fromEntries(
      ["light", "dark"].flatMap((theme) =>
        Object.entries({
          sky: palette.skyHorizon,
          haze: palette.skyShadow,
          meadow: palette.meadowTipA,
          glow: palette.skyEmber,
          wood: palette.wood,
        }).map(([name, value]) => [`--stacks-boot-${name}-${theme}`, value]),
      ),
    ),
  } as CSSProperties;

  return (
    <main
      className={`room-preview ${dark ? "dark" : ""}`}
      style={style}
      data-unit={about ? "about" : unit}
      data-case={capture}
    >
      <nav className="room-controls" aria-label="Shelf comparison controls">
        <div className="room-control-group">
          {(Object.keys(UNIT_LABELS) as Unit[]).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={!about && unit === value ? "default" : "outline"}
              aria-pressed={!about && unit === value}
              disabled={!summary[value][capture].ready}
              onClick={() => select({ unit: value })}
            >
              {UNIT_LABELS[value]}
            </Button>
          ))}
          <Button
            size="sm"
            variant={about ? "default" : "outline"}
            aria-pressed={about}
            onClick={() => select({ unit: "about" })}
          >
            About
          </Button>
        </div>
        <div className="room-control-group">
          <Button
            size="sm"
            variant="outline"
            onClick={() => select({ dark: !dark })}
            disabled={
              !about &&
              !summary[unit][
                `${dark ? "light" : "dark"}-${phone ? "phone" : "desktop"}`
              ].ready
            }
          >
            {dark ? "Light" : "Dark"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => select({ phone: !phone })}
            disabled={
              !about &&
              !summary[unit][
                `${dark ? "dark" : "light"}-${phone ? "desktop" : "phone"}`
              ].ready
            }
          >
            {phone ? "Desktop" : "Phone"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={replay}
            disabled={about || !loaded}
          >
            Replay
          </Button>
        </div>
      </nav>
      <div className={`room-viewport ${phone ? "room-phone" : ""}`}>
        {about ? (
          <div className="room-reference">
            <BootScreenArtwork
              readingBooks={reading.books}
              readingBookColors={reading.colors}
            />
          </div>
        ) : (
          <div className="stacks-boot">
            <div className="room-threshold">
              {svg ? (
                <div
                  ref={drawing}
                  className="room-drawing"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <p className="room-pending">
                  {UNIT_LABELS[unit]} · {capture.replace("-", " / ")} capture is
                  being prepared.
                </p>
              )}
              <p className="stacks-boot-wordmark">Chappy Asel</p>
            </div>
            <div className="stacks-boot-wait">
              <p className="stacks-boot-wait-label">
                Loading the 3D room<span aria-hidden>...</span>
              </p>
            </div>
          </div>
        )}
      </div>
      <p className="room-prototype-note">
        {about
          ? "About · Shelf objects only"
          : "Shared generator · Shelf objects only"}
        {!about && current.bytes !== null
          ? ` · ${(current.bytes / 1000).toFixed(1)} KB artwork`
          : ""}
        {" · Prototype · 3D handoff not implemented"}
      </p>
    </main>
  );
}
