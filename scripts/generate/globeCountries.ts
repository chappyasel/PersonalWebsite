// Natural Earth countries for the globe generators, one loader and one
// reading of VISITED_PLACES shared by the map texture (globe-map.ts) and the
// boot silhouette (generate-about-boot-silhouettes.mjs), so the two can never
// disagree about which ring of which country counts as visited.
import { VISITED_PLACES } from "../../src/app/components/stacks/scene/aboutTravel";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature, mesh } from "topojson-client";

export type Topology = Parameters<typeof feature>[0];
export type TopologyObject = Parameters<typeof mesh>[1];
export type Position = [number, number];
export type PolygonRings = Position[][];
/** The slice of GeoJSON these scripts read. topojson-client's own return
 * types are generic over properties in a way that fights the strict config,
 * so the decoded collection is read through this shape. */
export type Country = {
  properties: { name?: string } | null;
  geometry: { type: string; coordinates: unknown } | null;
};
export type Countries = { type: "FeatureCollection"; features: Country[] };
export type Geometry =
  | { type: "Polygon"; coordinates: PolygonRings }
  | { type: "MultiPolygon"; coordinates: PolygonRings[] };

const require = createRequire(import.meta.url);

export function loadCountries() {
  const topology = JSON.parse(
    readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"),
  ) as Topology;
  const countriesObject = topology.objects.countries as
    | TopologyObject
    | undefined;
  if (!countriesObject)
    throw new Error(
      "world-atlas countries-50m.json has no `countries` object.",
    );
  const countries = feature(topology, countriesObject) as unknown as Countries;
  if (!("features" in countries))
    throw new Error("world-atlas countries did not decode to a collection.");
  const byName = new Map<string, Country>();
  for (const country of countries.features) {
    const name = country.properties?.name;
    if (name) byName.set(name, country);
  }
  return { topology, countriesObject, countries, byName };
}

export function ringsOf(country: Country): PolygonRings[] {
  const geometry = country.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon")
    return [geometry.coordinates as PolygonRings];
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates as PolygonRings[];
  throw new Error(`Unexpected geometry ${geometry.type}.`);
}

/** Every polygon of a geometry, each as its rings (outer first). */
export function polygonsOf(geometry: Geometry): PolygonRings[] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

/** Even-odd test on the outer ring only; the parts picked by point are
 * islands, whose holes are lakes. */
export function ringContains(ring: Position[], [x, y]: Position) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function polygonContaining(
  polygons: PolygonRings[],
  point: Position,
  label: string,
) {
  const hit = polygons.find((rings) => ringContains(rings[0]!, point));
  if (!hit) throw new Error(`No ring of the country contains ${label}.`);
  return hit;
}

/** The visited countries as geometries, VISITED_PLACES' part/omit/within
 * rules applied. Throws on a name the atlas does not know. */
export function visitedGeometry(byName: Map<string, Country>): Geometry[] {
  const out: Geometry[] = [];
  for (const place of VISITED_PLACES) {
    const country = byName.get(place.country);
    if (!country)
      throw new Error(
        `"${place.country}" is not a Natural Earth 50m country name.`,
      );
    let polygons = ringsOf(country);
    if (place.part) {
      const { lon, lat, label } = place.part;
      polygons = [polygonContaining(polygons, [lon, lat], label)];
    }
    for (const omitted of place.omit ?? []) {
      const drop = polygonContaining(
        polygons,
        [omitted.lon, omitted.lat],
        omitted.label,
      );
      polygons = polygons.filter((rings) => rings !== drop);
    }
    if (place.within) {
      const { lon, lat } = place.within;
      const kept = polygons.filter((rings) => {
        const [x, y] = rings[0]![0]!;
        return x >= lon[0] && x <= lon[1] && y >= lat[0] && y <= lat[1];
      });
      if (kept.length === 0)
        throw new Error(`No ring of ${place.country} starts inside its box.`);
      polygons = kept;
    }
    out.push(
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0]! }
        : { type: "MultiPolygon", coordinates: polygons },
    );
  }
  return out;
}
