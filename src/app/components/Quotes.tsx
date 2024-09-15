import React from "react";

const Quotes: React.FC = () => {
  return (
    <section className="mt-20 space-y-6 text-sm italic text-body/80">
      <blockquote className="mx-auto max-w-2xl text-center">
        &ldquo;The test of a first-rate intelligence is the ability to hold two
        opposing ideas in mind at the same time and still retain the ability to
        function. One should, for example, be able to see that things are
        hopeless yet be determined to make them otherwise.&rdquo;
        <footer className="mt-2 text-body/60">~ F. Scott Fitzgerald</footer>
      </blockquote>
      <blockquote className="mx-auto max-w-2xl text-center">
        &ldquo;Success is the ability to go from failure to failure without
        losing your enthusiasm.&rdquo;
        <footer className="mt-2 text-body/60">~ Winston Churchill</footer>
      </blockquote>
    </section>
  );
};

export default Quotes;
