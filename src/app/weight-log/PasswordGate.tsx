"use client";

import { useState, useTransition } from "react";

import { setDadAccessCookie } from "~/app/dad/actions";

export function WeightLogPasswordGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Private
        </p>
        <h1 className="font-rounded text-3xl font-semibold">Weight Log</h1>
        <p className="mb-8 mt-3 text-sm text-muted-foreground">
          Enter the site password to view this history.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            startTransition(async () => {
              try {
                if (await setDadAccessCookie(password)) {
                  // A document navigation avoids retaining private RSC data in a router cache.
                  window.location.replace("/weight-log");
                } else {
                  setError("Incorrect password.");
                  setPassword("");
                }
              } catch {
                setError("Unable to sign in. Please try again.");
              }
            });
          }}
        >
          <label htmlFor="weight-log-password" className="block text-sm">
            Password
          </label>
          <input
            id="weight-log-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-3 dark:border-neutral-700"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            disabled={pending || !password}
            className="w-full rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Checking…" : "View history"}
          </button>
        </form>
      </div>
    </div>
  );
}
