"use client";

import { useEffect } from "react";

/**
 * The last resort. This replaces the root layout, so it runs when the layout
 * itself is what failed: the theme provider, the font loader, the stylesheet.
 * Nothing here may depend on any of those, which is why the palette is
 * hard-coded from globals.css rather than read through its tokens.
 */
const styles = `
  :root { color-scheme: light dark; }
  .ge-body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1.5rem;
    text-align: center;
    font-family: Georgia, "Times New Roman", serif;
    background: hsl(60 9% 98%);
    color: hsl(24 6% 36%);
  }
  .ge-title { margin: 0; font-size: 1.875rem; color: hsl(25 6% 32%); }
  .ge-body p { margin: 0; max-width: 32rem; font-size: 1.125rem; }
  .ge-actions { display: flex; gap: 1rem; margin-top: 1rem; }
  .ge-button {
    font: inherit;
    cursor: pointer;
    border-radius: 0.5rem;
    border: 1px solid hsl(25 6% 32% / 0.4);
    background: none;
    padding: 0.5rem 1rem;
    color: hsl(25 6% 32%);
  }
  .ge-link { color: inherit; font-size: 0.875rem; text-underline-offset: 4px; }
  .ge-digest { font-size: 0.875rem; }
  @media (prefers-color-scheme: dark) {
    .ge-body { background: hsl(24 10% 6%); color: hsl(24 5% 75%); }
    .ge-title, .ge-button { color: hsl(24 6% 83%); }
    .ge-button { border-color: hsl(24 6% 83% / 0.4); }
  }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="ge-body">
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <h1 className="ge-title">Something went wrong</h1>
        <p>The site failed to load. It is usually temporary.</p>
        <div className="ge-actions">
          <button className="ge-button" onClick={reset}>
            Try again
          </button>
          {/* A full document navigation, not next/link. The router is part
              of what this boundary catches, so routing through it is the one
              thing that cannot be assumed to work here. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="ge-link" href="/">
            Back to home
          </a>
        </div>
        {error.digest && <p className="ge-digest">Error ID: {error.digest}</p>}
      </body>
    </html>
  );
}
