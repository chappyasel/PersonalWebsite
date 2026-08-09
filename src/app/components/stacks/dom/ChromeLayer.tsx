"use client";

// Screen-fixed chrome over the world: shared styles (scrollbar hiding, grain
// reveal), film grain, bottom vignette, the persistent name, the caption line,
// and the now strip. Everything here is pointer-events-none; interactive
// layers manage their own events.
import { unitCaption, UNITS, type StacksData } from "../data";
import { useStacks } from "../store";
import { GRAIN_URI } from "../theme";
import NowStrip from "./NowStrip";

export function GrainReveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`stacks-reveal ${className ?? ""}`}
      style={{ animationDelay: `${index * 130}ms` }}
    >
      {children}
    </div>
  );
}

export default function ChromeLayer({ data }: { data: StacksData }) {
  const activeUnit = useStacks((s) => s.activeUnit);
  const caption = unitCaption(UNITS[activeUnit]?.slug ?? "about", data);
  return (
    <>
      <style>{`
        :root { --stacks-ease: cubic-bezier(0.16, 1, 0.3, 1); }
        .stacks-scroll { scrollbar-width: none; }
        .stacks-scroll::-webkit-scrollbar { display: none; }
        .stacks-reveal {
          opacity: 0;
          animation: stacks-resolve 0.9s var(--stacks-ease) forwards;
        }
        @keyframes stacks-resolve {
          from { opacity: 0; filter: blur(14px); transform: translateY(12px); }
          to { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
      `}</style>
      <div
        className="pointer-events-none absolute inset-0 z-[5] opacity-[0.10] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_URI, backgroundSize: "180px" }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[12dvh] bg-gradient-to-t from-background/90 to-transparent" />
      <div className="pointer-events-none absolute left-5 top-4 z-20 md:left-7 md:top-5">
        <GrainReveal index={0}>
          <p className="font-serif text-base tracking-tight text-foreground/85 md:text-lg">
            Chappy Asel
          </p>
        </GrainReveal>
      </div>
      {/* Caption line — lives left of the placard column so it never collides */}
      <div className="pointer-events-none absolute bottom-[9.5dvh] left-0 right-0 z-[7] hidden justify-center px-6 md:flex md:right-[26rem] xl:right-[28rem]">
        <p
          key={caption}
          className="font-serif text-sm tracking-wide text-muted-foreground/90 transition-opacity duration-500"
        >
          {caption}
        </p>
      </div>
      <div className="pointer-events-none absolute bottom-[3.5dvh] left-0 right-0 z-[7] hidden justify-center px-6 md:flex md:right-[26rem] xl:right-[28rem]">
        <GrainReveal index={2}>
          <NowStrip data={data} />
        </GrainReveal>
      </div>
    </>
  );
}
