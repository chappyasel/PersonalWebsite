import type { InsectCollisionIndex } from "./insectCollision";
import { compileLandingSnapshot } from "./insectLandingSnapshot";
import type {
  LandingWorkerRequest,
  LandingWorkerResponse,
} from "./insectLandingWorkerClient";

let index: InsectCollisionIndex | undefined;
self.onmessage = ({ data }: MessageEvent<LandingWorkerRequest>) => {
  if (data.index) index = data.index;
  if (!index) throw new Error("Landing worker has no collision snapshot");
  const started = performance.now();
  const { result } = compileLandingSnapshot({ ...data.snapshot, index });
  self.postMessage({
    generation: data.generation,
    result,
    workerMs: performance.now() - started,
  } satisfies LandingWorkerResponse);
};
