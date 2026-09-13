"use client";

import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

import type { AssetKind, CaptureCase, ComparisonSummary } from "./data";

const bytes = (value: number | null) =>
  value === null ? "Measuring" : `${(value / 1000).toFixed(1)} KB`;

function CaptureImage({
  capture,
  kind,
  ready,
  version,
  title,
  full,
}: {
  capture: CaptureCase;
  kind: AssetKind;
  ready: boolean;
  version: number;
  title: string;
  full?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [capture, kind, version]);
  if (!ready || failed)
    return (
      <div className="flex min-h-64 items-center justify-center px-8 text-center text-sm text-stone-500">
        This capture is still being prepared. Try Desktop / Light while the
        matrix finishes.
      </div>
    );
  return (
    <div
      className={`flex min-h-64 items-center justify-center overflow-auto p-5 ${capture.startsWith("dark") ? "bg-[#181a18]" : "bg-[#f4f1e9]"}`}
    >
      {/* Exact captured pixels are the subject of this comparison. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={title}
        onError={() => setFailed(true)}
        src={`/admin/boot-comparison/asset?case=${capture}&kind=${kind}&v=${version}`}
        className={full ? "h-auto w-full" : "h-auto max-w-full"}
      />
    </div>
  );
}

export function Comparison({
  initialSummary,
}: {
  initialSummary: ComparisonSummary;
}) {
  const [theme, setTheme] = useState("light");
  const [viewport, setViewport] = useState("1440x900");
  const [detail, setDetail] = useState<"raw" | "illustrated">("raw");
  const [full, setFull] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [version, setVersion] = useState(0);
  const capture = `${theme}-${viewport}` as CaptureCase;
  const current = summary[capture];
  const readyCount = Object.values(summary).filter(
    (entry) => entry.aReady && entry.bReady,
  ).length;
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch("/admin/boot-comparison/asset?summary=1")
        .then((response) => response.json())
        .then((data: ComparisonSummary) => {
          setSummary(data);
          setVersion((value) => value + 1);
        })
        .catch(() => {
          // Retain the last readable capture while workers replace artifacts.
        });
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  const bKind = `b-${detail}${full ? "-full" : ""}` as AssetKind;
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-10">
      <div className="mx-auto max-w-[1320px] space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Projects / prototype review
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              One shelf. Two ways to draw it.
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A feasibility study of six parts from Projects. Both approaches
              extract mounted geometry and preserve image details. The next
              design pass includes the complete shelf in a loading-screen
              preview.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="http://127.0.0.1:3322/admin/projects-boot-prototype?viewport=desktop">
                Open full Projects preview
              </a>
            </Button>
          </div>
          <Badge variant="outline">
            Prototype · {readyCount}/6 comparisons available
          </Badge>
        </header>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-xl border p-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Capture theme</p>
            <div className="flex gap-1">
              {["light", "dark"].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={theme === value ? "default" : "outline"}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {value === "light" ? "Light" : "Dark"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Capture viewport</p>
            <div className="flex gap-1">
              {[
                ["1440x900", "Desktop"],
                ["2056x1290", "Wide"],
                ["390x844", "Phone"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={viewport === value ? "default" : "outline"}
                  aria-pressed={viewport === value}
                  onClick={() => setViewport(value!)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Mask prototype details
            </p>
            <div className="flex gap-1">
              {(["raw", "illustrated"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={detail === value ? "default" : "outline"}
                  aria-pressed={detail === value}
                  onClick={() => setDetail(value)}
                >
                  {value === "raw" ? "Original colours" : "Reduced palette"}
                </Button>
              ))}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={full}
            onClick={() => setFull(!full)}
          >
            {full ? "Show loading size" : "Inspect full capture"}
          </Button>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>A · Geometry + CPU</CardTitle>
                <Badge variant="secondary">{bytes(current.aBytes)}</Badge>
              </div>
              <CardDescription>
                Export triangles, UVs and texture pixels; project and draw in
                Node.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <CaptureImage
                capture={capture}
                kind={full ? "a-full" : "a"}
                ready={current.aReady}
                version={version}
                title="Geometry and CPU rendering prototype"
                full={full}
              />
              <p className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                Preserves image details. Uses a custom depth and texture
                renderer, with a shared wood-colour adapter.
              </p>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>B · Renderer masks + details</CardTitle>
                <Badge variant="secondary">
                  {bytes(
                    detail === "raw"
                      ? current.bRawBytes
                      : current.bIllustratedBytes,
                  )}
                </Badge>
              </div>
              <CardDescription>
                Three renders coverage and image details; Node traces and
                packages them.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <CaptureImage
                capture={capture}
                kind={bKind}
                ready={current.bReady}
                version={version}
                title={`Renderer masks prototype with ${detail} details`}
                full={full}
              />
              <p className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                {detail === "raw"
                  ? "Original detail colours are the closer payload comparison with A."
                  : "The reduced palette saves bytes and visibly changes the photo and screen."}{" "}
                Lighting and final colour treatment remain separate work.
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {viewport.replace("x", " × ")} CSS pixels · DPR 1 · SwiftShader.
          Payload = gzipped SVG + referenced images, excluding preview UI.
          Initial-size images scale down only if the panel is too narrow. Full
          captures use different framing. Camera rest, responsive transfer and
          final fidelity are still under review.
        </p>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>The live shelf, for context</CardTitle>
            <CardDescription>
              Frozen reference from the geometry capture. Other Projects props
              remain visible here; both prototypes intentionally omit them. This
              is a visual reference, not a pixel-aligned overlay.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <CaptureImage
              capture={capture}
              kind="live"
              ready={current.aReady}
              version={version}
              title="Frozen live Projects shelf reference"
            />
          </CardContent>
        </Card>
        <footer className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <a
              href="http://127.0.0.1:3321/admin/boot-prototype-geometry"
              target="_blank"
              rel="noreferrer"
            >
              Open geometry worktree
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href="http://127.0.0.1:3322/admin/boot-render-masks-prototype"
              target="_blank"
              rel="noreferrer"
            >
              Open mask worktree
            </a>
          </Button>
        </footer>
      </div>
    </main>
  );
}
