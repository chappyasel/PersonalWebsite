"use client";

// Systems — the operating manual binder, the 3:45 alarm clock, and quote
// cards; book pile below.
import { ContactPool } from "../GroundPool";
import { AlarmClock, Binder, QuoteCards } from "../objects";
import { BookPile, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitSystems({ palette }: UnitProps) {
  return (
    <ShelfUnit
      palette={palette}
      lower={
        <group>
          <BookPile palette={palette} x={0.3} />
          <ContactPool color={palette.shadow} size={[0.78, 0.52]} position={[0.32, 0, 0.01]} />
        </group>
      }
    >
      <group position={[-1.0, 0, 0]}>
        <Binder palette={palette} />
      </group>
      <group position={[-0.15, 0, 0.08]}>
        <AlarmClock palette={palette} />
      </group>
      <group position={[0.85, 0, 0]}>
        <QuoteCards palette={palette} />
      </group>
      <ContactPool color={palette.shadow} size={[0.6, 0.52]} position={[-1.0, 0, -0.02]} />
      <ContactPool color={palette.shadow} size={[0.48, 0.34]} position={[-0.15, 0, 0.07]} />
      <ContactPool color={palette.shadow} size={[0.85, 0.42]} position={[0.85, 0, 0.03]} />
    </ShelfUnit>
  );
}
