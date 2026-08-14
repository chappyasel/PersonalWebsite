import React from "react";

const Quotes: React.FC = () => {
  return (
    // These are the FLAT-page styles. On the 3D homepage the quotes float
    // directly over the meadow, where even the round-2 glow treatment lost
    // to the grass — PlacardLayer wraps this slot in .stacks-quotes and
    // rewrites it white-on-dark-halo there. Keep the two contexts
    // decoupled: white text here would vanish into the flat page's
    // background.
    <section className="mt-20 space-y-6 text-sm italic text-foreground/80 [text-shadow:_0_0_16px_rgba(255,255,255,0.9)] dark:[text-shadow:_0_0_16px_rgba(0,0,0,0.85)]">
      <blockquote className="mx-auto max-w-2xl text-center">
        &ldquo;The test of a first-rate intelligence is the ability to hold two
        opposing ideas in mind at the same time and still retain the ability to
        function. One should, for example, be able to see that things are
        hopeless yet be determined to make them otherwise.&rdquo;
        <footer className="mt-2 text-muted-foreground">~ F. Scott Fitzgerald</footer>
      </blockquote>
      <blockquote className="mx-auto max-w-2xl text-center">
        &ldquo;Success is the ability to go from failure to failure without
        losing your enthusiasm.&rdquo;
        <footer className="mt-2 text-muted-foreground">~ Winston Churchill</footer>
      </blockquote>
      <blockquote className="mx-auto max-w-2xl text-center">
        &ldquo;History will be kind to me, for I intend to write it.&rdquo;
        <footer className="mt-2 text-muted-foreground">
          ~ Winston Churchill (whoops, twice haha)
        </footer>
      </blockquote>
    </section>
  );
};

export default Quotes;
