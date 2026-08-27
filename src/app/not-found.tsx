import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import DaylightSky from "~/components/daylight/DaylightSky";

import "~/styles/daylight.css";

export default function NotFound() {
  return (
    <main className="daylight-root font-serif">
      <div className="dl-screen">
        <DaylightSky />
        <h1 className="text-7xl font-bold text-[hsl(var(--dl-sky-ink))]">
          404
        </h1>
        <p className="mt-3 text-lg">Page not found.</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 font-sans text-sm text-[hsl(var(--dl-sky-ink)/0.85)] underline underline-offset-4 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
        >
          <ArrowLeftIcon size={13} weight="bold" />
          Back to home
        </Link>
      </div>
    </main>
  );
}
