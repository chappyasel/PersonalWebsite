"use client";

import SharedResults from "../SharedResults";
import styles from "../personalities.module.css";
import { useEffect, useState } from "react";

import type { SharedSnapshot } from "~/lib/personalities/sharing";

export default function SharedPage() {
  const [data, setData] = useState<{
    snapshot: SharedSnapshot;
    expiresAt: number | null;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    // The capability stays in the fragment, outside server URLs and referrers.
    const token = window.location.hash.slice(1);
    async function load() {
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
          throw new Error("This link is unavailable or has expired.");
        const response = await fetch("/api/personalities/shared", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "This link is unavailable or has expired."
              : "Could not load this shared result. Please try again.",
          );
        setData(
          (await response.json()) as {
            snapshot: SharedSnapshot;
            expiresAt: number | null;
          },
        );
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return (
    <main className={styles["app-shell"]}>
      <header className={styles["app-header"]}>
        <div>
          <p className={styles.eyebrow}>BIG FIVE</p>
          <h1>
            {data?.snapshot.results.length === 2
              ? data.snapshot.results.map((r) => r.label).join(" & ")
              : "Personalities"}
          </h1>
        </div>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : data ? (
        <SharedResults snapshot={data.snapshot} />
      ) : (
        <p role="status">Opening shared results…</p>
      )}
    </main>
  );
}
