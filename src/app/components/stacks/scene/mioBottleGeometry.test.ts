import { describe, expect, it } from "vitest";

import { MIO_SIZES, mioBottleGeometry } from "./mioBottleGeometry";

describe("mioBottleGeometry", () => {
  it("fills the requested extents, bottom at y=0, centred on x/z", () => {
    for (const size of Object.values(MIO_SIZES)) {
      const geo = mioBottleGeometry(size);
      const box = geo.boundingBox!;
      expect(box.min.y).toBeCloseTo(0, 6);
      expect(box.max.y).toBeCloseTo(size.height, 6);
      expect(box.max.x - box.min.x).toBeCloseTo(size.width, 6);
      expect(box.max.z - box.min.z).toBeCloseTo(size.depth, 6);
      expect(box.min.x + box.max.x).toBeCloseTo(0, 6);
      expect(box.min.z + box.max.z).toBeCloseTo(0, 6);
    }
  });

  it("carries a full u chart and v equal to height, so the underside does not eat the band", () => {
    const size = MIO_SIZES.lemonade;
    const geo = mioBottleGeometry(size);
    const uv = geo.attributes.uv!;
    const pos = geo.attributes.position!;
    let uMin = 1;
    let uMax = 0;
    for (let i = 0; i < uv.count; i++) {
      uMin = Math.min(uMin, uv.getX(i));
      uMax = Math.max(uMax, uv.getX(i));
      expect(uv.getY(i)).toBeCloseTo(pos.getY(i) / size.height, 6);
    }
    expect(uMin).toBe(0);
    expect(uMax).toBe(1);
    // The flat base (y = 0) is the v = 0 row only; nothing above the base
    // samples it.
    for (let i = 0; i < uv.count; i++) {
      if (pos.getY(i) > 1e-6) expect(uv.getY(i)).toBeGreaterThan(0);
    }
  });

  it("is the same silhouette at both sizes (ratios, not shape, differ)", () => {
    const a = mioBottleGeometry(MIO_SIZES.hydrate);
    const b = mioBottleGeometry(MIO_SIZES.lemonade);
    expect(a.attributes.position!.count).toBe(b.attributes.position!.count);
    // Widest point sits at the same relative height.
    const widestY = (geo: typeof a, height: number) => {
      const pos = geo.attributes.position!;
      let best = 0;
      let bestY = 0;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.abs(pos.getX(i));
        if (r > best) {
          best = r;
          bestY = pos.getY(i) / height;
        }
      }
      return bestY;
    };
    expect(widestY(a, MIO_SIZES.hydrate.height)).toBeCloseTo(
      widestY(b, MIO_SIZES.lemonade.height),
      6,
    );
  });
});
