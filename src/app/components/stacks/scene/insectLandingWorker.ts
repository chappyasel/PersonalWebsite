import { InsectLandingWorkerClient } from "./insectLandingWorkerClient";
import { scenePerformanceController } from "./scenePerformance";

export const insectLandingWorker = new InsectLandingWorkerClient(
  () =>
    new Worker(new URL("./insectLanding.worker.ts", import.meta.url), {
      type: "module",
      name: "insect-landing",
    }),
);
scenePerformanceController.subscribe(() => {
  insectLandingWorker.setEnabled(
    scenePerformanceController.getSnapshot().insectLandingWorker,
  );
});

insectLandingWorker.setEnabled(
  scenePerformanceController.getSnapshot().insectLandingWorker,
);
