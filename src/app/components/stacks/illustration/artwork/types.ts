export type RoomArtworkTheme = "light" | "dark";
export type RoomArtworkViewport = "desktop" | "phone";
export type RoomArtworkUnit =
  | "books"
  | "weightlifting"
  | "systems"
  | "projects"
  | "musings"
  | "talks";
export type RoomArtworkMetadata = Readonly<{
  unit: RoomArtworkUnit;
  unitIndex: number;
  theme: RoomArtworkTheme;
  viewport: RoomArtworkViewport;
  src: string;
  viewBox: readonly number[];
  /** Shelf bounds width in captured raster pixels, for consistent CSS shelf scale. */
  drawingWidth: number;
  sourceRevision: string;
  sourceFingerprint: string;
  raster: readonly number[];
  browserViewport: readonly number[];
  camera: { world: readonly number[]; projection: readonly number[] };
  unitWorld: readonly number[] | null;
  unitWorldPrecisionDecimals: number;
  registrationSrc: string;
  registrationAvailable: boolean;
  /** Immutable captured probe points used to place the SVG before WebGL exists. */
  layoutPoints: readonly (readonly number[])[];
}>;

/** Lazy per-case metadata. Matrix arrays follow Three.js column-major order. */
export type RoomArtworkRegistration = Readonly<{
  version: 1;
  unit: RoomArtworkUnit;
  index: number;
  case: string;
  viewBox: readonly number[];
  raster: readonly number[];
  browserViewport: readonly number[];
  camera: { world: readonly number[]; projection: readonly number[] };
  unitWorld: readonly number[] | null;
  unitWorldPrecisionDecimals: number;
  registrationAvailable: boolean;
  registrationUnavailableReason: string | null;
  sourceRevision: string;
  sourceFingerprint: string;
  artworkSha256: string;
  probes: readonly {
    id: string;
    path: string;
    owner: string;
    geometryType: string;
    localMatrix: readonly number[];
    sample: { kind: "bounds" | "point"; coordinates: readonly number[] };
    /** Required for bounds samples: immutable mesh-local expected point from archived geometry. */
    readonly capturedCoordinates?: readonly [number, number, number];
  }[];
  boundsProbeProvenance?: Readonly<{
    sourceRevision: string;
    sources: readonly { path: string; sha256: string; snapshot?: string }[];
    plank: string;
    dimensions: readonly number[];
    roundedBox: { radius: number; smoothness: number; centered: boolean };
    derivation: string;
    coordinateSpace: string;
    coordinatePrecision: string;
  }>;
  owners: readonly {
    id: string;
    parentOwner?: string | null;
    meshCount: number;
    paths: readonly string[];
    geometryIdentitySha256: string;
    poseSha256: string;
  }[];
  geometryIdentityScope: string;
  poseHashEncoding: string;
  geometryHashEncoding: string;
  requiresLiveIdentityValidation: true;
  requiresDataIdentity: boolean;
  capturedDataSha256: string | null;
  liveRotations: readonly {
    owner: string;
    name: string;
    rotation: readonly number[];
  }[];
  limitations: readonly string[];
}>;
