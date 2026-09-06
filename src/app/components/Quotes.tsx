import { QuotesIcon } from "@phosphor-icons/react/dist/ssr";
import quotes from "public/data/quotes.json";

// The ten quotes from the Cues page, in its order, all visible at once. This
// is the third card of Personal Systems and copies the Manual and Routine
// card structure verbatim: an absolute surface marked data-placard-surface
// behind relative content, so PlacardLayer dresses it with the same glass on
// desktop, the same flat fill on the mobile sheet, and the same dark-mode
// material as its neighbours. Free-floating type over the sheet went muddy in
// light mode; a card's own ground is what keeps the cards beside it readable.
// Body ink is inherited, as in the Routine card, so each layout's placard
// colour applies.
const Quotes: React.FC = () => (
  <section className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
    <div className="relative w-full p-5 text-sm sm:p-6">
      <div
        data-placard-background=""
        data-placard-surface=""
        className="absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg"
      />
      <div className="relative">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground md:text-xl">
          <QuotesIcon weight="duotone" className="size-5 shrink-0" />
          Favorite Quotes
        </h2>
        <div className="mt-4 space-y-5 italic">
          {quotes.map(({ quote, author }) => (
            <blockquote key={quote}>
              &ldquo;{quote}&rdquo;
              <footer className="mt-1 not-italic text-muted-foreground">
                ~ {author}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default Quotes;
