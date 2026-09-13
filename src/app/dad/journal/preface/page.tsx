import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";
import { readMarkdownFile } from "~/app/dad/lib/content";

export default function PrefacePage() {
  const { content } = readMarkdownFile("Journal/preface.md");

  return (
    <div className="py-8">
      <Link
        href="/dad"
        className="group mb-12 inline-flex items-center gap-2 font-serif text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">
          <ArrowLeftIcon
            aria-hidden="true"
            className="inline-block size-[1em] align-[-0.125em]"
          />
        </span>
        Back
      </Link>

      <p className="mb-4 text-center font-serif text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        Foreword
      </p>

      <h1 className="mb-8 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        Dad&apos;s Opening Letter
      </h1>

      <MarkdownRenderer content={content} />
    </div>
  );
}
