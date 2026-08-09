"use client";

// Systems — the operating manual binder, the 3:45 alarm clock, and quote
// cards; book pile below.
import { AlarmClock, Binder, QuoteCards } from "../objects";
import { BookPile, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitSystems({ palette }: UnitProps) {
  return (
    <ShelfUnit
      palette={palette}
      lower={<BookPile palette={palette} x={0.3} />}
    >
      <group position={[-1.0, 0.035, 0]}>
        <Binder palette={palette} />
      </group>
      <group position={[-0.15, 0.035, 0.08]}>
        <AlarmClock palette={palette} />
      </group>
      <group position={[0.85, 0.035, 0]}>
        <QuoteCards palette={palette} />
      </group>
    </ShelfUnit>
  );
}
