import { QuotesIcon } from "@phosphor-icons/react/dist/ssr";
import quotes from "public/data/quotes.json";

import styles from "./Quotes.module.css";

const Quotes: React.FC = () => (
  <section className={`${styles.quotes} w-full px-1 pb-3 pt-9 text-sm`}>
    <h2 className="flex items-center gap-2 text-lg font-semibold text-inherit md:text-xl">
      {/* One step up from the 20px box the other card titles use, because the
          box was never the problem. This glyph is two small marks sitting in
          the upper half of its square, where BookOpenText, PenNib and Code
          fill theirs, so at a matched 20px it showed noticeably less ink than
          the titles beside it. The box is now 24px to even out what you
          actually see rather than what the class names agree on. */}
      <QuotesIcon aria-hidden weight="duotone" className="size-6 shrink-0" />
      Favorite Quotes
    </h2>
    <div className="mt-6 space-y-8">
      {quotes.map(({ quote, author }) => (
        <blockquote key={quote}>
          <p className="italic leading-relaxed">&ldquo;{quote}&rdquo;</p>
          <footer className="mt-1 text-xs text-inherit opacity-80">
            ~ {author}
          </footer>
        </blockquote>
      ))}
    </div>
  </section>
);

export default Quotes;
