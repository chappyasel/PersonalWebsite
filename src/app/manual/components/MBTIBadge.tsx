"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const mbtiColors: Record<string, string> = {
  E: "text-amber-500",
  I: "text-blue-500",
  N: "text-purple-500",
  S: "text-emerald-500",
  T: "text-sky-500",
  F: "text-pink-500",
  J: "text-indigo-500",
  P: "text-orange-500",
  A: "text-emerald-600",
};

const mbtiLabels: Record<string, string> = {
  E: "Extraverted",
  I: "Introverted",
  N: "Intuitive",
  S: "Observant",
  T: "Thinking",
  F: "Feeling",
  J: "Judging",
  P: "Prospecting",
  A: "Assertive",
};

export default function MBTIBadge({ mbti }: { mbti: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  // Split "ENTJ-A" into individual characters, preserving the hyphen
  const parts = mbti.split("");

  return (
    <div ref={ref} className="flex flex-col items-center gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">
        Myers-Briggs
      </h3>
      <div className="flex items-baseline gap-0.5">
        {parts.map((char, i) => {
          if (char === "-") {
            return (
              <span
                key={i}
                className="mx-0.5 text-3xl font-light text-muted-foreground/30 md:text-4xl"
              >
                -
              </span>
            );
          }
          return (
            <motion.span
              key={i}
              className={`text-4xl font-bold md:text-5xl ${mbtiColors[char] ?? "text-foreground"}`}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              {char}
            </motion.span>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {parts
          .filter((c) => c !== "-")
          .map((char, i) => (
            <span
              key={i}
              className={`text-xs ${mbtiColors[char] ?? "text-muted-foreground"}`}
            >
              {mbtiLabels[char] ?? char}
            </span>
          ))}
      </div>
    </div>
  );
}
