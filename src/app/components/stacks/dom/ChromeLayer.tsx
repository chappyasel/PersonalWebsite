"use client";

// Screen-fixed chrome over the world: shared styles (scrollbar hiding, grain
// reveal), animated film grain, bottom vignette, and the persistent name.
// Everything here is pointer-events-none; interactive layers manage their own
// events.
import { GRAIN_URI } from "../theme";

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

export default function ChromeLayer() {
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
        .stacks-grain {
          position: absolute;
          inset: -5%;
          background-size: 180px;
          opacity: 0.06;
        }
        @media (prefers-reduced-motion: no-preference) {
          .stacks-grain {
            animation: stacks-grain-jitter 0.7s steps(1) infinite;
          }
        }
        @keyframes stacks-grain-jitter {
          0% { transform: translate3d(0, 0, 0); }
          12.5% { transform: translate3d(-2.6%, -1.6%, 0); }
          25% { transform: translate3d(1.8%, -2.9%, 0); }
          37.5% { transform: translate3d(-3.4%, 2.2%, 0); }
          50% { transform: translate3d(2.9%, 1.4%, 0); }
          62.5% { transform: translate3d(-1.2%, 3.1%, 0); }
          75% { transform: translate3d(3.3%, -0.9%, 0); }
          87.5% { transform: translate3d(-2.1%, -3.2%, 0); }
        }
      `}</style>
      {/* Grain jitters via compositor transform only — animating seed or
          background-position forces CPU repaints. The wrapper clips the 110%
          oversize so jitter never exposes an edge. */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        <div
          className="stacks-grain"
          style={{ backgroundImage: GRAIN_URI }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[12dvh] bg-gradient-to-t from-background/90 to-transparent" />
      <div className="pointer-events-none absolute left-5 top-4 z-20 md:left-7 md:top-5">
        <GrainReveal index={0}>
          <p className="font-serif text-base tracking-tight text-foreground/85 md:text-lg">
            Chappy Asel
          </p>
        </GrainReveal>
      </div>
    </>
  );
}
