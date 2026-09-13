import type { PropDestination } from "./scene/interactionRegistry";

export const ANALYZE_DATA_REPOSITORY =
  "https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData";

type ArtifactAction =
  | Readonly<{
      kind: "external";
      label: string;
      href: string;
    }>
  | Readonly<{
      kind: "destination";
      label: string;
      to: PropDestination;
    }>;

type SceneArtifactCollection =
  | "training-analysis"
  | "training-history"
  | "about-photos"
  | "training-photos"
  | "projects-photos"
  | "talks-photos"
  | "systems-photos";

type SceneArtifactBase = Readonly<{
  id: string;
  interactionId: string;
  collection: SceneArtifactCollection;
  title: string;
  caption?: string;
  actions: readonly ArtifactAction[];
}>;

type SceneImageArtifactShape = SceneArtifactBase &
  Readonly<{
    kind: "image";
    mode?: "aggregate" | "big-three" | "dexa";
    image: string;
    /** The scene-sized file already loaded beneath the fullscreen master. */
    previewImage?: string;
    width: number;
    height: number;
  }>;

// Every artifact is a print today. The Homework icon used to be a "model"
// kind with its own second-canvas inspector; it now flies to the camera in
// the live room like the Mac and the globe (PropApproach), and its caption
// comes from content/stacks/objects.md like every other prop's.
type SceneArtifactShape = SceneImageArtifactShape;

const ANALYSIS_ACTIONS = [
  {
    kind: "external",
    label: "Analyze data",
    href: ANALYZE_DATA_REPOSITORY,
  },
  {
    kind: "destination",
    label: "Open Weightlifting",
    to: "weightlifting",
  },
] as const satisfies readonly ArtifactAction[];

const NO_ACTIONS = [] as const satisfies readonly ArtifactAction[];
const LINKEDIN_ACTIONS = [
  {
    kind: "external",
    label: "Open LinkedIn",
    href: "https://www.linkedin.com/in/chappyasel/",
  },
] as const satisfies readonly ArtifactAction[];
const INSTAGRAM_ACTIONS = [
  {
    kind: "external",
    label: "Open Instagram",
    href: "https://www.instagram.com/chappyasel/",
  },
] as const satisfies readonly ArtifactAction[];
const BOYS_WITH_GAINS_ACTIONS = [
  {
    kind: "external",
    label: "Open Boys with Gains",
    href: "https://www.instagram.com/boyswithgains/",
  },
] as const satisfies readonly ArtifactAction[];

type PhotoCollection = Extract<SceneArtifactCollection, `${string}-photos`>;

function photoArtifact<
  const Id extends string,
  const Collection extends PhotoCollection,
>(input: {
  id: Id;
  collection: Collection;
  title: string;
  image: string;
  previewImage?: string;
  width: number;
  height: number;
  actions?: readonly ArtifactAction[];
}) {
  return {
    id: input.id,
    kind: "image" as const,
    interactionId: `grab:photo:${input.id}` as const,
    collection: input.collection,
    title: input.title,
    image: input.image,
    previewImage: input.previewImage,
    width: input.width,
    height: input.height,
    actions: input.actions ?? NO_ACTIONS,
  };
}

export const SCENE_PHOTOS = [
  photoArtifact({
    id: "portrait",
    collection: "about-photos",
    title: "Chappy Asel",
    image: "/images/about/profile.jpg",
    width: 1254,
    height: 1254,
    actions: LINKEDIN_ACTIONS,
  }),
  photoArtifact({
    id: "about-collective-group-v8",
    collection: "about-photos",
    title: "The AI Collective",
    image: "/images/stacks/v8/about-collective-group.webp",
    width: 1024,
    height: 640,
  }),
  photoArtifact({
    id: "about-family-v8",
    collection: "about-photos",
    title: "Family portrait",
    image: "/images/stacks/v8/about-family.webp",
    width: 769,
    height: 1024,
  }),
  photoArtifact({
    id: "about-speaking-candid-v8",
    collection: "about-photos",
    title: "Speaking candid",
    image: "/images/stacks/v8/about-speaking-candid.webp",
    width: 1024,
    height: 683,
  }),
  photoArtifact({
    id: "about-delicate-arch-v8",
    collection: "about-photos",
    title: "Delicate Arch",
    image: "/images/stacks/v8/about-delicate-arch.webp",
    width: 1024,
    height: 1024,
  }),
  photoArtifact({
    id: "about-profile-full-v8",
    collection: "about-photos",
    title: "Portrait",
    image: "/images/stacks/v8/about-profile-full.webp",
    previewImage: "/images/stacks/v8/512/about-profile-full.webp",
    width: 600,
    height: 800,
    actions: INSTAGRAM_ACTIONS,
  }),
  photoArtifact({
    id: "training-trophy-side-v8",
    collection: "training-photos",
    title: "Boys with Gains trophy",
    image: "/images/stacks/v8/training-trophy-side.webp",
    width: 820,
    height: 1024,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "training-stage-kneeling-v8",
    collection: "training-photos",
    title: "Boys with Gains stage portrait",
    image: "/images/stacks/v8/training-stage-kneeling.webp",
    width: 819,
    height: 1024,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "training-stage-side-v8",
    collection: "training-photos",
    title: "Boys with Gains on stage",
    image: "/images/stacks/v8/training-stage-side.webp",
    width: 819,
    height: 1024,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "training-trophy-front-v8",
    collection: "training-photos",
    title: "Boys with Gains trophy portrait",
    image: "/images/stacks/v8/training-trophy-front.webp",
    width: 819,
    height: 1024,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "training-golf-group-v8",
    collection: "training-photos",
    title: "Golf group",
    image: "/images/stacks/v8/training-golf-group.webp",
    width: 1024,
    height: 768,
  }),
  photoArtifact({
    id: "training-pickleball-group-v8",
    collection: "training-photos",
    title: "Pickleball group",
    image: "/images/stacks/v8/training-pickleball-group.webp",
    width: 1024,
    height: 768,
  }),
  photoArtifact({
    id: "training-golf-flag-v8",
    collection: "training-photos",
    title: "On the green",
    image: "/images/stacks/v8/training-golf-flag.webp",
    width: 768,
    height: 1024,
  }),
  photoArtifact({
    id: "training-gym-pose-v8",
    collection: "training-photos",
    title: "Gym portrait",
    image: "/images/stacks/v8/training-gym-pose.webp",
    width: 768,
    height: 1024,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "training-deadlift-v8",
    collection: "training-photos",
    title: "Deadlift",
    image: "/images/stacks/v8/training-deadlift.webp",
    width: 1024,
    height: 969,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "training-bench-v8",
    collection: "training-photos",
    title: "Bench press",
    image: "/images/stacks/v8/training-bench.webp",
    width: 1024,
    height: 996,
    actions: BOYS_WITH_GAINS_ACTIONS,
  }),
  photoArtifact({
    id: "projects-coding-couch-v8",
    collection: "projects-photos",
    title: "Coding on the couch",
    image: "/images/stacks/v8/projects-coding-couch.webp",
    width: 1024,
    height: 819,
  }),
  photoArtifact({
    id: "projects-facebook-v8",
    collection: "projects-photos",
    title: "At Facebook",
    image: "/images/stacks/v8/projects-facebook.webp",
    width: 1365,
    height: 1024,
  }),
  photoArtifact({
    id: "projects-wwdc-v8",
    collection: "projects-photos",
    title: "WWDC",
    image: "/images/stacks/v8/projects-wwdc.webp",
    width: 824,
    height: 1024,
  }),
  photoArtifact({
    id: "talk-demo-night-v8",
    collection: "talks-photos",
    title: "Demo night",
    image: "/images/stacks/v8/talk-demo-night.webp",
    width: 1024,
    height: 640,
  }),
  photoArtifact({
    id: "talk-dc-policy-v8",
    collection: "talks-photos",
    title: "DC policy talk",
    image: "/images/stacks/v8/talk-dc-policy.webp",
    width: 1024,
    height: 576,
  }),
  photoArtifact({
    id: "talk-ann-interview-v8",
    collection: "talks-photos",
    title: "Interview with Ann",
    image: "/images/stacks/v8/talk-ann-interview.webp",
    width: 1024,
    height: 640,
  }),
  photoArtifact({
    id: "talk-consensus-phone-v8",
    collection: "talks-photos",
    title: "Consensus",
    image: "/images/stacks/v8/talk-consensus-phone.webp",
    width: 1024,
    height: 576,
  }),
  photoArtifact({
    id: "talk-panel-v8",
    collection: "talks-photos",
    title: "Panel discussion",
    image: "/images/stacks/v8/talk-panel.webp",
    width: 1024,
    height: 576,
  }),
  photoArtifact({
    id: "systems-working-session-v8",
    collection: "systems-photos",
    title: "Working session",
    image: "/images/stacks/v8/systems-working-session.webp",
    width: 1024,
    height: 536,
  }),
  photoArtifact({
    id: "systems-supplements-v8",
    collection: "systems-photos",
    title: "Daily supplements",
    image: "/images/stacks/v8/systems-supplements.webp",
    width: 1024,
    height: 511,
  }),
  photoArtifact({
    id: "systems-sf-dusk-v8",
    collection: "systems-photos",
    title: "San Francisco at dusk",
    image: "/images/stacks/v8/systems-sf-dusk.webp",
    width: 1024,
    height: 768,
  }),
  photoArtifact({
    id: "systems-lake-v8",
    collection: "systems-photos",
    title: "At the lake",
    image: "/images/stacks/v8/systems-lake.webp",
    width: 1024,
    height: 768,
  }),
  photoArtifact({
    id: "systems-lighthouse-v8",
    collection: "systems-photos",
    title: "Lighthouse",
    image: "/images/stacks/v8/systems-lighthouse.webp",
    width: 819,
    height: 1024,
  }),
  photoArtifact({
    id: "systems-home-office-v8",
    collection: "systems-photos",
    title: "Home office",
    image: "/images/stacks/v8/systems-home-office.webp",
    width: 1024,
    height: 768,
  }),
] as const satisfies readonly SceneImageArtifactShape[];

export type PhotoArtifactId = (typeof SCENE_PHOTOS)[number]["id"];
export type TrainingBoardPhotoId =
  | "training-trophy-side-v8"
  | "training-stage-kneeling-v8"
  | "training-stage-side-v8"
  | "training-trophy-front-v8";

export const TRAINING_FIGURES = [
  {
    id: "aggregate-strength",
    kind: "image",
    interactionId: "action:training-figure:aggregate-strength",
    collection: "training-analysis",
    mode: "aggregate",
    title: "Aggregate one rep max trend",
    image: "/images/stacks/training-figures/aggregate-strength.png",
    width: 972,
    height: 579,
    actions: ANALYSIS_ACTIONS,
  },
  {
    id: "big-three",
    kind: "image",
    interactionId: "action:training-figure:big-three",
    collection: "training-analysis",
    mode: "big-three",
    title: "Big 3 progression",
    image: "/images/stacks/training-figures/big-three.png",
    width: 964,
    height: 568,
    actions: ANALYSIS_ACTIONS,
  },
  {
    id: "dexa-history",
    kind: "image",
    interactionId: "action:training-figure:dexa-history",
    collection: "training-analysis",
    mode: "dexa",
    title: "DEXA lean mass vs bodyweight",
    image: "/images/stacks/training-figures/dexa-lean-mass-vs-bodyweight.png",
    width: 2000,
    height: 1600,
    actions: ANALYSIS_ACTIONS,
  },
] as const satisfies readonly SceneImageArtifactShape[];

export type TrainingFigureId = (typeof TRAINING_FIGURES)[number]["id"];
export type TrainingFigureMode = "aggregate" | "big-three" | "dexa";

const LIFT_TABLE_ARTIFACT = {
  id: "lift-table",
  kind: "image",
  interactionId: "artifact:lift-table",
  collection: "training-history",
  title: "Lift Table",
  caption: "The first lifting chart I put together.",
  image: "/images/stacks/artifacts/lift-table.png",
  width: 1275,
  height: 1650,
  actions: [
    {
      kind: "external",
      label: "Open PDF",
      href: "/documents/lift-table.pdf",
    },
  ],
} as const satisfies SceneImageArtifactShape;

export const SCENE_ARTIFACTS = [
  ...TRAINING_FIGURES,
  ...SCENE_PHOTOS,
  LIFT_TABLE_ARTIFACT,
] as const satisfies readonly SceneArtifactShape[];

export type SceneArtifactId = (typeof SCENE_ARTIFACTS)[number]["id"];
export type SceneArtifact = SceneArtifactShape &
  (typeof SCENE_ARTIFACTS)[number];
export type SceneImageArtifact = Extract<SceneArtifact, { kind: "image" }>;

export function isSceneImageArtifact(
  artifact: SceneArtifact,
): artifact is SceneImageArtifact {
  return artifact.kind === "image";
}

const TRAINING_BOARD_PHOTO_IDS: ReadonlySet<PhotoArtifactId> = new Set([
  "training-trophy-side-v8",
  "training-stage-kneeling-v8",
  "training-stage-side-v8",
  "training-trophy-front-v8",
]);

export const TRAINING_BOARD_PHOTOS = SCENE_PHOTOS.filter((photo) =>
  TRAINING_BOARD_PHOTO_IDS.has(photo.id),
);

export function sceneArtifactById(
  id: SceneArtifactId | null,
): SceneArtifact | null {
  return (SCENE_ARTIFACTS.find((artifact) => artifact.id === id) ??
    null) as SceneArtifact | null;
}

export function adjacentSceneArtifact(
  id: SceneArtifactId,
  offset: -1 | 1,
): SceneArtifact {
  const artifact = sceneArtifactById(id)!;
  const collection = SCENE_ARTIFACTS.filter(
    (entry) => entry.collection === artifact.collection,
  );
  const index = collection.findIndex((entry) => entry.id === id);
  const next = (index + offset + collection.length) % collection.length;
  return collection[next]!;
}

export function sceneArtifactCollection(id: SceneArtifactId): SceneArtifact[] {
  const artifact = sceneArtifactById(id)!;
  return SCENE_ARTIFACTS.filter(
    (entry) => entry.collection === artifact.collection,
  );
}
