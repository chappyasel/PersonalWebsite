import {
  diagnoseInsectPerch,
  registerInsectCollisionRoot,
} from "../insectFlightWorld";
import { type InsectPerch, registerInsectPerch } from "../insectPerches";
import { registerSceneInteraction } from "../interactionRegistry";
import { COVER_H, COVER_W, FEATURED_COVER_Z, coverSeat } from "../primitives";
import { SHELF_SURFACE } from "../shelfGeometry";
import { splitShelfRows } from "../shelfSpacing";
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOWER_FEATURED_ROW_Z,
  featuredBookPerchDefinitions,
  layoutFeatured,
} from "./UnitBooks";
import { featuredBookThickness } from "./featuredBookGeometry";

const releases: Array<() => void> = [];
const disposables: Array<{ dispose(): void }> = [];

afterEach(() => {
  for (const release of releases.reverse()) release();
  releases.length = 0;
  for (const disposable of disposables.splice(0)) disposable.dispose();
});

/** The current eight-book featured rank, including the four semantic Perches.
 * Their visual layout depends on order and count, not title metadata. */
const FEATURED_BOOKS = [
  { key: "the-12-levers", label: "The 12 Levers", pages: 368 },
  { key: "superminds", label: "Superminds", pages: 384 },
  { key: "bowling-alone", label: "Bowling Alone", pages: 544 },
  {
    key: "7-habits-of-highly-effective-people",
    label: "7 Habits of Highly Effective People",
    pages: 374,
  },
  {
    key: "barking-up-the-wrong-tree",
    label: "Barking Up the Wrong Tree",
    pages: 161,
  },
  { key: "homo-deus", label: "Homo Deus", pages: 496 },
  { key: "life-3-0", label: "Life 3.0", pages: 384 },
  {
    key: "thinking-fast-and-slow",
    label: "Thinking, Fast and Slow",
    pages: 528,
  },
].map((book) => ({
  id: book.key,
  title: book.label,
  coverUrl: `/test/${book.key}.jpg`,
  pageCount: book.pages,
  audioLengthMin: null,
}));

const FEATURED = FEATURED_BOOKS.map((book) => ({
  url: book.coverUrl,
  key: book.id,
  label: book.title,
  color: "#74604d",
  thickness: featuredBookThickness(book.pageCount, book.audioLengthMin),
}));

function mountLifeThreePointZero() {
  const scene = new THREE.Scene();
  const unit = new THREE.Group();
  scene.add(unit);

  const rows = splitShelfRows(FEATURED, 4);
  const lower = layoutFeatured(rows.lower, 41, -1.24);
  const item = lower.find(
    (candidate) => candidate.kind === "cover" && candidate.key === "life-3-0",
  );
  if (item?.kind !== "cover") throw new Error("Life 3.0 not laid out");

  // This is the rendered Grabbable -> HeldFacing -> page-block transform from
  // FeaturedCover, without React or a WebGL canvas.
  const owner = new THREE.Group();
  owner.position.set(
    item.x,
    SHELF_SURFACE.lower,
    LOWER_FEATURED_ROW_Z + FEATURED_COVER_Z + (item.dz ?? 0),
  );
  unit.add(owner);
  const facing = new THREE.Group();
  const scale = item.s ?? 1;
  const lean = item.lean ?? 0;
  const thickness = item.thickness ?? 0.048;
  facing.position.y = coverSeat(scale, lean, item.riser ?? 0);
  facing.rotation.set(0, item.yaw ?? 0, lean);
  facing.scale.setScalar(scale);
  owner.add(facing);
  const geometry = new THREE.BoxGeometry(
    COVER_W - 0.014,
    COVER_H - 0.014,
    thickness - 0.01,
  );
  const material = new THREE.MeshBasicMaterial();
  disposables.push(geometry, material);
  const pages = new THREE.Mesh(geometry, material);
  pages.position.set(0.005, 0, -thickness / 2 - 0.003);
  facing.add(pages);

  const definition = featuredBookPerchDefinitions(FEATURED_BOOKS).find(
    (candidate) => candidate.id === "books:life-3-0-pages",
  );
  if (!definition) throw new Error("Life 3.0 Perch missing from catalog");
  const anchor = new THREE.Object3D();
  anchor.position.set(...definition.position);
  unit.add(anchor);
  const perch: InsectPerch = {
    id: definition.id,
    unitIndex: 1,
    kind: "perch",
    ownerId: definition.ownerId ?? null,
    ownerPrefix: null,
    lampId: null,
    clearance: 0.12,
    tangent: definition.tangent,
    contactDistanceTolerance: null,
    normalTolerance: 0.3,
    anchor,
    normal: definition.normal,
    resolvedRoot: null,
    resolvedSurface: null,
    resolvedOwnerId: null,
    localPosition: new THREE.Vector3(),
    localNormal: new THREE.Vector3(0, 1, 0),
  };
  releases.push(
    registerSceneInteraction({
      id: "book:life-3-0",
      root: owner,
      activeUnits: [1],
    }),
    registerInsectCollisionRoot(1, unit),
    registerInsectPerch(perch),
  );
  unit.updateWorldMatrix(true, true);
  return { item, pages };
}

describe("Unit Books authored Perches", () => {
  it("keeps the Life 3.0 page-top anchor on its current featured-book owner", () => {
    const { item, pages } = mountLifeThreePointZero();
    const diagnostic = diagnoseInsectPerch(
      "books:life-3-0-pages",
      "butterfly",
      0,
    );
    const top = new THREE.Vector3(0, (COVER_H - 0.014) / 2, 0);
    pages.localToWorld(top);

    expect(
      new THREE.Vector3(
        diagnostic.authoredAnchor.x,
        diagnostic.authoredAnchor.y,
        diagnostic.authoredAnchor.z,
      ).distanceTo(top),
      "The authored diamond must remain on the rendered semantic object, not merely resolve to it by owner id",
    ).toBeLessThan(1e-6);

    expect(
      {
        rejectionCode: diagnostic.rejectionCode,
        authoredAnchor: diagnostic.authoredAnchor,
        resolvedContact: diagnostic.resolvedContact,
        renderedBookX: item.x,
        renderedPageTop: top,
      },
      "The semantic anchor and the rendered Life 3.0 transform must share one layout seam",
    ).toMatchObject({
      rejectionCode: "none",
    });
  });
});
